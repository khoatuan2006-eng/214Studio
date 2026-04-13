# Debug: list all pose/face names for the first character
import sys
sys.stdout.reconfigure(encoding='utf-8')

from backend.core.scene_graph.asset_scanner import AssetRegistry

r = AssetRegistry('backend/storage')
r.scan()

for char in r.characters.values():
    print(f"\n=== {char.name} (id: {char.id}) ===")
    print(f"\nPOSES ({len(char.poses)}):")
    for k in sorted(char.poses.keys()):
        print(f"  [{k}] -> {char.poses[k].url_path}")
    print(f"\nFACES (first 15 of {len(char.faces)}):")
    for k in sorted(char.faces.keys())[:15]:
        print(f"  [{k}] -> {char.faces[k].url_path}")
