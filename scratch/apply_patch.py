import re
import os

with open("backend/routers/automation.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add background_id signature
content = content.replace(
    "    registry: AssetRegistry | None = None,\n) -> SceneGraph:",
    "    registry: AssetRegistry | None = None,\n    background_id: str | None = None,\n) -> SceneGraph:"
)
content = content.replace(
    "    registry: AssetRegistry | None = None\n) -> SceneGraph:",
    "    registry: AssetRegistry | None = None,\n    background_id: str | None = None,\n) -> SceneGraph:"
)

# 2. Add Background Node logic at start of build_scene_from_script
bg_logic = """
    from backend.core.scene_graph.node import SceneNode
    # ── Step 0: Add Background ──
    if background_id:
        bg_url = f"/static/stages/{background_id}.png"
        stages_dir = os.path.join(registry.storage_dir, "stages")
        if os.path.exists(stages_dir):
            for fname in os.listdir(stages_dir):
                if fname.startswith(background_id) and fname.endswith(".png"):
                    bg_url = f"/static/stages/{fname}"
                    break
        
        bg_node = SceneNode(
            id=f"bg-{background_id}",
            name=background_id,
            node_type="background_layer"
        )
        bg_node.metadata["assetUrl"] = bg_url
        bg_node.set_z_index(-100)
        bg_node.set_position(9.6, 5.4) 
        bg_node.set_scale(1.0)
        graph.add_node(bg_node)
        logger.info(f"Added background {background_id} -> {bg_url}")
"""
content = re.sub(r'(    if not registry:\n        raise ValueError\("AssetRegistry required"\)\n)', r'\1' + bg_logic, content)

# 3. Add char_states tracking
char_state_logic = """
    # State tracking for continuity
    # state: {x, y, scale, z_index}
    char_states: dict[str, dict] = {}
"""
content = content.replace("    char_infos: dict[str, object] = {}", "    char_infos: dict[str, object] = {}\n" + char_state_logic)

# 4. Initialize char_states in Step 1
init_char_state = """
        char_home_x[char_name] = home_x
        # Initial Facing: if x > 9.6, face left (-0.25). if x <= 9.6, face right (0.25)
        initial_scale_x = -0.25 if home_x > 9.6 else 0.25

        char_states[char_name] = {
            "x": home_x,
            "y": home_y,
            "home_x": home_x,
            "scale_x": initial_scale_x,
            "scale_y": 0.25,
            "z_index": i * 10
        }
"""
content = re.sub(r'(        char_home_x\[char_name\] = home_x\n)', init_char_state, content)

# 5. Apply z_index and initial_scale_x to characters in Step 1
apply_char_state = """
                char_nodes[char_name] = match.group(1)
                
                # Update initial properties cleanly
                node = graph.get_node(char_nodes[char_name])
                if node:
                    node.set_z_index(char_states[char_name]["z_index"])
                    node.set_scale_xy(initial_scale_x, 0.25)
"""
content = re.sub(r'(                char_nodes\[char_name\] = match\.group\(1\)\n)', apply_char_state, content)

# 6. Pre-declare ai_analysis and movement in loop
content = re.sub(r'(        available_faces = char_info\.face_names if char_info else \[\]\n)', r'\1\n        movement = "idle"\n', content)

# 7. Apply smart facing AND replace old movement bounds
smart_facing = """
        # ── Depth, Scale, Position Logic ──
        node = graph.get_node(node_id)
        if isinstance(node, CharacterNode):
            st = char_states[line.character]
            # Set up tracks
            for prop in ["x", "y", "scale_x", "scale_y", "z_index"]:
                node.keyframes.setdefault(prop, [])

            abs_scale = abs(st["scale_x"])
            
            # Apply movement logic
            if movement == "enter_left":
                st["x"], st["y"], st["z_index"] = 5.0, 7.5, 10
                st["scale_x"] = abs_scale # look right
                node.keyframes["x"].append({"time": start_time - 0.5, "value": -4.0, "easing": "linear"})
                node.keyframes["x"].append({"time": start_time + 0.5, "value": st["x"], "easing": "ease_out"})
            elif movement == "enter_right":
                st["x"], st["y"], st["z_index"] = 14.2, 7.5, 10
                st["scale_x"] = -abs_scale # look left
                node.keyframes["x"].append({"time": start_time - 0.5, "value": 23.0, "easing": "linear"})
                node.keyframes["x"].append({"time": start_time + 0.5, "value": st["x"], "easing": "ease_out"})
            elif movement == "exit_left":
                node.keyframes["x"].append({"time": end_time, "value": -4.0, "easing": "ease_in"})
            elif movement == "exit_right":
                node.keyframes["x"].append({"time": end_time, "value": 23.0, "easing": "ease_in"})
            elif movement == "step_forward":
                st["y"] = 8.5
                st["scale_y"] = 0.3
                st["scale_x"] = 0.3 if st["scale_x"] > 0 else -0.3
                st["z_index"] += 50
                node.keyframes["y"].append({"time": speak_start, "value": st["y"], "easing": "ease_out"})
                node.keyframes["scale_x"].append({"time": speak_start, "value": st["scale_x"], "easing": "ease_out"})
                node.keyframes["scale_y"].append({"time": speak_start, "value": st["scale_y"], "easing": "ease_out"})
                node.keyframes["z_index"].append({"time": start_time, "value": st["z_index"], "easing": "step"})
            elif movement == "step_back":
                st["y"] = 7.0
                st["scale_y"] = 0.22
                st["scale_x"] = 0.22 if st["scale_x"] > 0 else -0.22
                st["z_index"] -= 50
                node.keyframes["y"].append({"time": speak_start, "value": st["y"], "easing": "ease_out"})
                node.keyframes["scale_x"].append({"time": speak_start, "value": st["scale_x"], "easing": "ease_out"})
                node.keyframes["scale_y"].append({"time": speak_start, "value": st["scale_y"], "easing": "ease_out"})
                node.keyframes["z_index"].append({"time": start_time, "value": st["z_index"], "easing": "step"})
            elif movement == "walk_to_center":
                st["x"] = 9.6
                st["z_index"] += 10
                node.keyframes["x"].append({"time": speak_start, "value": st["x"], "easing": "ease_out"})
            else:
                if num_chars > 1:
                    # Default Speaker Moves toward center
                    speak_x = home_x + (center_x - home_x) * SPEAKER_PULL
                    if last_speaker and last_speaker != line.character:
                        prev_node_id = char_nodes.get(last_speaker)
                        prev_home = char_home_x.get(last_speaker, 9.6)
                        if prev_node_id:
                            prev_node = graph.get_node(prev_node_id)
                            if isinstance(prev_node, CharacterNode):
                                prev_node.keyframes.setdefault("x", [])
                                prev_node.keyframes["x"].append({
                                    "time": start_time,
                                    "value": prev_home,
                                    "easing": "ease_out",
                                })
                                # Update states back
                                l_st = char_states.get(last_speaker)
                                if l_st:
                                    l_st["x"] = prev_home
                    node.keyframes["x"].append({"time": start_time, "value": st["x"], "easing": "linear"})
                    node.keyframes["x"].append({"time": speak_start, "value": speak_x, "easing": "ease_out"})
                    st["x"] = speak_x

            # SMART FACING: Evaluate against other characters
            other_x_sum = 0
            count = 0
            for o_name, o_st in char_states.items():
                if o_name != line.character and o_st["y"] > 0:
                    other_x_sum += o_st["x"]
                    count += 1
            if count > 0:
                avg_other_x = other_x_sum / count
                if st["x"] < avg_other_x and st["scale_x"] < 0:
                    st["scale_x"] = abs(st["scale_x"])
                    node.keyframes["scale_x"].append({"time": start_time, "value": st["scale_x"], "easing": "step"})
                elif st["x"] > avg_other_x and st["scale_x"] > 0:
                    st["scale_x"] = -abs(st["scale_x"])
                    node.keyframes["scale_x"].append({"time": start_time, "value": st["scale_x"], "easing": "step"})

            # Always emit static or updated transform base keys
            node.keyframes["x"].append({"time": end_time + 0.1, "value": st["x"], "easing": "linear"})
            node.keyframes["y"].append({"time": end_time + 0.1, "value": st["y"], "easing": "linear"})
            node.keyframes["scale_x"].append({"time": end_time + 0.1, "value": st["scale_x"], "easing": "linear"})
        
        if isinstance(node, CharacterNode):
"""
content = re.sub(
    r'(        # ── Speaker Movement: Walk toward center ──\n        node = graph\.get_node\(node_id\)\n        home_x = char_home_x\.get\(line\.character, 9\.6\)\n\n        if isinstance\(node, CharacterNode\) and num_chars > 1:\n(.+?)\n        if isinstance\(node, CharacterNode\):\n)',
    smart_facing,
    content,
    flags=re.DOTALL
)

# 8. Apply listener facing logic
listener_facing = """
            # Smart Facing for listeners too
            l_st = char_states.get(other_name)
            active_spkr_st = char_states.get(line.character)
            if l_st and active_spkr_st:
                if l_st["x"] < active_spkr_st["x"] and l_st["scale_x"] < 0:
                    l_st["scale_x"] = abs(l_st["scale_x"])
                    other_node.keyframes.setdefault("scale_x", [])
                    other_node.keyframes["scale_x"].append({"time": start_time, "value": l_st["scale_x"], "easing": "step"})
                elif l_st["x"] > active_spkr_st["x"] and l_st["scale_x"] > 0:
                    l_st["scale_x"] = -abs(l_st["scale_x"])
                    other_node.keyframes.setdefault("scale_x", [])
                    other_node.keyframes["scale_x"].append({"time": start_time, "value": l_st["scale_x"], "easing": "step"})
"""
content = re.sub(
    r'(            other_poses = other_info\.pose_names if other_info else \[\]\n)',
    listener_facing + r'\1',
    content
)

# 9. Ensure background_id passes from script_to_scene if available
content = content.replace(
    "            registry=_registry,\n        )",
    "            registry=_registry,\n            background_id=req.background_id,\n        )"
)

# 10. Update LipsyncRequest schema
content = content.replace("class ScriptToSceneRequest(BaseModel):\n    \"\"\"Request to convert a script into a SceneGraph.\"\"\"\n    lines: list[ScriptLine]\n    character_map: dict[str, str]  # script character name → asset registry char_id\n    voice_map: dict[str, str] = {}", "class ScriptToSceneRequest(BaseModel):\n    \"\"\"Request to convert a script into a SceneGraph.\"\"\"\n    lines: list[ScriptLine]\n    character_map: dict[str, str]  # script character name → asset registry char_id\n    background_id: Optional[str] = None\n    voice_map: dict[str, str] = {}")

import sys
if content.find("background_layer") == -1:
    print("Failed to replace background!")
    sys.exit(1)

with open("backend/routers/automation.py", "w", encoding="utf-8") as f:
    f.write(content)
print("Patch applied successfully.")
