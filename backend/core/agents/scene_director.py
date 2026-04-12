"""
Scene Director Agent — Uses Gemini Function Calling to build a SceneGraph.

In Phase 3, we use direct function calling instead of the complex 
Director -> Builder -> Reviewer pipeline. The AI Director is given a suite 
of tools (add_character, set_position, etc.) and iteratively calls them 
to achieve the user's prompt.
"""

import logging
import json
import time
from typing import Optional, List, Dict, Any

from google import genai
from google.genai import types

from backend.core.ai_config import get_ai_config
from backend.core.scene_graph.scene import SceneGraph
from backend.core.scene_graph.tools import SceneToolExecutor, TOOL_DEFINITIONS

logger = logging.getLogger(__name__)

def parse_tools_for_gemini() -> List[types.Tool]:
    """Convert our JSON schemas into Gemini's types.Tool."""
    declarations = []
    for d in TOOL_DEFINITIONS:
        decl = types.FunctionDeclaration()
        decl.name = d["name"]
        decl.description = d["description"]
        
        props = d["parameters"].get("properties", {})
        req = d["parameters"].get("required", [])
        
        schema = types.Schema(
            type=types.Type.OBJECT,
            properties={},
            required=req if req else None
        )
        
        for k, v in props.items():
            t_type = types.Type.STRING
            if v["type"] == "number": t_type = types.Type.NUMBER
            elif v["type"] == "integer": t_type = types.Type.INTEGER
            elif v["type"] == "boolean": t_type = types.Type.BOOLEAN
            elif v["type"] == "object": t_type = types.Type.OBJECT
            elif v["type"] == "array": t_type = types.Type.ARRAY
            
            s = types.Schema(type=t_type, description=v.get("description", ""))
            if "enum" in v:
                setattr(s, "enum", v["enum"])
            schema.properties[k] = s
            
        decl.parameters = schema
        declarations.append(decl)
        
    return [types.Tool(function_declarations=declarations)]


class SceneDirector:
    """Agent that interacts with the user and builds the Scene Graph directly."""
    
    def __init__(self, scene_graph: Optional[SceneGraph] = None, asset_registry=None):
        self.config = get_ai_config()
        # Handle cases where API key is not set
        if not self.config.has_api_key:
            logger.warning("[SceneDirector] No API key configured. API calls will fail.")
            self.client = None
        else:
            self.client = genai.Client(api_key=self.config.api_key)
            
        self.scene_graph = scene_graph or SceneGraph()
        self.asset_registry = asset_registry
        self.executor = SceneToolExecutor(self.scene_graph, asset_registry=asset_registry)
        self.gemini_tools = parse_tools_for_gemini()
        self.chat_session = None

    def _get_system_instruction(self, available_characters: str) -> str:
        return f"""You are the AnimeStudio AI Director. 
Your job is to direct an animated scene by calling tools to manipulate a Scene Graph.
You will receive user requests like "add the flower girl and move her left".
You MUST use the provided tools to accomplish the task. Call them sequentially.

IMPORTANT RULES:
1. ALWAYS call get_scene_summary FIRST before making changes, so you know what's already in the scene.
2. Do NOT add a character if one with the same character_id already exists — reuse the existing node.
3. When referring to an existing object, use its exact object_id (from the scene summary), not its name.
4. To clear the scene, call remove_object for each object currently in the scene.
5. Keyframe property names use snake_case: x, y, scale_x, scale_y, rotation, opacity.

Canvas Information:
- Width: 19.2 world units (1920px)
- Height: 10.8 world units (1080px)
- Center: x=9.6, y=5.4
- Easing: linear, easeIn, easeOut, easeInOut

Available Characters:
{available_characters}

Be concise. When you are done invoking tools to satisfy the user's prompt, provide a short friendly textual response indicating what you did.
"""

    def start_session(self, available_characters_desc: str):
        """Initializes a new chat session with the AI."""
        if not self.client:
            raise ValueError("API key not configured.")
            
        system_instruction = self._get_system_instruction(available_characters_desc)
        self._last_characters_desc = available_characters_desc
        
        self.chat_session = self.client.chats.create(
            model=self.config.model,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=self.gemini_tools,
                temperature=0.4,
            )
        )

    def process_message(self, user_message: str, current_scene_state: Optional[dict] = None) -> str:
        """
        Send a message to the AI, process any tool calls, and return the AI's final text response.
        """
        if not self.chat_session:
            raise RuntimeError("Session not started. Call start_session first.")

        # Update the SceneGraph if the client provided a newer state
        if current_scene_state:
            # Safely merge or replace graph state
            # For simplicity, if we receive a state, we deserialize and replace
            from backend.core.scene_graph.scene import SceneGraph
            self.scene_graph = SceneGraph.from_dict(current_scene_state)
            self.executor.graph = self.scene_graph

        logger.info(f"[SceneDirector] User Message: {user_message}")
        
        # Send initial message with rate-limit retry across all keys
        last_error = None
        for attempt in range(self.config.total_keys + 1):
            try:
                response = self.chat_session.send_message(user_message)
                last_error = None
                break  # Success
            except Exception as e:
                error_str = str(e)
                last_error = e
                if ("429" in error_str or "RESOURCE_EXHAUSTED" in error_str) and attempt < self.config.total_keys:
                    if self.config.rotate_key():
                        logger.warning(f"[SceneDirector] Key {attempt+1} rate-limited, rotating to {self.config.current_key_label}...")
                        self.client = genai.Client(api_key=self.config.api_key)
                        self.start_session(self._last_characters_desc or "")
                        time.sleep(1)  # Brief pause before retry
                        continue
                    else:
                        break
                else:
                    raise
        
        if last_error is not None:
            raise RuntimeError(
                f"All {self.config.total_keys} API keys exhausted (rate limited). "
                f"Please wait ~60s or add more API keys."
            )
        
        # Max 15 iterations of tool calling loop to prevent infinite loops
        for _ in range(15):
            # Check if there are function calls
            function_calls = []
            if response.function_calls:
                function_calls = response.function_calls
            elif response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if part.function_call:
                        function_calls.append(part.function_call)

            if not function_calls:
                # No more tools to call, return final text
                final_text = response.text or "Done."
                return final_text
                
            # Execute tool calls
            tool_responses = []
            for fc in function_calls:
                tool_name = fc.name
                # fc.args may be a struct or dict, extract arguments
                args = {}
                if hasattr(fc, "args"):
                    # Depending on SDK version, args might be a dict or a protobuf struct
                    if isinstance(fc.args, dict):
                        args = fc.args
                    elif hasattr(fc.args, "items"):
                        args = dict(fc.args.items())
                    else:
                        try:
                            # Try to hackily convert to dict if it's a map
                            args = dict(fc.args)
                        except Exception:
                            logger.error(f"Failed to extract args from {fc.args}")

                logger.info(f"[SceneDirector] Tool Call: {tool_name}({args})")
                
                # Execute it against our SceneGraph via the executor
                result = self.executor.execute(tool_name, args)
                
                # Format response for Gemini
                result_dict = {"result": result.to_str(), "success": result.success}
                if not result.success:
                    result_dict["error"] = result.error
                
                tool_responses.append(
                    types.Part.from_function_response(
                        name=tool_name,
                        response=result_dict
                    )
                )
            
            # Send the tool responses back to the model
            logger.info(f"[SceneDirector] Sending {len(tool_responses)} tool responses back...")
            response = self.chat_session.send_message(tool_responses)
            
        logger.warning("[SceneDirector] Max tool call iterations reached.")
        return response.text or "Reached maximum tool iterations."
