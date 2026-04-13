import json
from google import genai
from google.genai import types

from backend.core.scene_graph.tools import TOOL_DEFINITIONS

def main():
    print(f"Loaded {len(TOOL_DEFINITIONS)} tools.")
    
    # Try converting to types.Tool
    try:
        declarations = []
        for d in TOOL_DEFINITIONS:
            # We need to map JSON schema types to types.Type
            decl = types.FunctionDeclaration()
            decl.name = d["name"]
            decl.description = d["description"]
            
            # Rebuild parameters
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
                # Handle enum if present
                if "enum" in v:
                    # In new SDK, Schema has an enum field
                    setattr(s, "enum", v["enum"])
                schema.properties[k] = s
                
            decl.parameters = schema
            declarations.append(decl)
            
        tool = types.Tool(function_declarations=declarations)
        print("Successfully created types.Tool with function declarations!")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()
