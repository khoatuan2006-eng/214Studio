import re
import os

path = r'd:\AnimeStudio_Project\backend\routers\automation.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace single-line .append(...)
# node.keyframes["x"].append({"time": start_time, "value": st["x"], "easing": "linear"})
# obj.keyframes["prop"].append({"time": T, "value": V, "easing": E}) -> obj.add_keyframe("prop", T, V, E)
pattern_single = r'(\w+)\.keyframes\["([^"]+)"\]\.append\(\{\s*"time":\s*(.+?),\s*"value":\s*(.+?),\s*"easing":\s*(.+?)\s*\}\)'
content = re.sub(pattern_single, r'\1.add_keyframe("\2", \3, \4, \5)', content)

# Replace multiline
# node.keyframes["x"].append({
#     "time": start_time,
#     "value": prev_home,
#     "easing": "ease_out",
# })
pattern_multi = r'(\w+)\.keyframes\["([^"]+)"\]\.append\(\{\s*"time":\s*(.+?),\s*"value":\s*(.+?),\s*"easing":\s*(.+?),\s*\}\)'
content = re.sub(pattern_multi, r'\1.add_keyframe("\2", \3, \4, \5)', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Replaced!")
