import os
import json
import uuid

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBRARY_PATH = os.path.join(BASE_DIR, "data", "custom_library.json")

def load_library():
    if not os.path.exists(LIBRARY_PATH):
        return {"categories": []}
    try:
        with open(LIBRARY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"categories": []}

def save_library(data):
    with open(LIBRARY_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

def create_category(name: str, z_index: int):
    lib = load_library()
    new_cat = {
        "id": f"cat_{uuid.uuid4().hex[:8]}",
        "name": name,
        "z_index": z_index,
        "subfolders": []
    }
    lib["categories"].append(new_cat)
    save_library(lib)
    return new_cat

def update_category(cat_id: str, new_name: str, new_z: int):
    lib = load_library()
    for cat in lib["categories"]:
        if cat["id"] == cat_id:
            if new_name is not None:
                cat["name"] = new_name
            if new_z is not None:
                cat["z_index"] = new_z
            save_library(lib)
            return cat
    return None

def delete_category(cat_id: str):
    lib = load_library()
    initial_len = len(lib["categories"])
    lib["categories"] = [cat for cat in lib["categories"] if cat["id"] != cat_id]
    if len(lib["categories"]) < initial_len:
        save_library(lib)
        return True
    return False

def create_subfolder(cat_id: str, name: str):
    lib = load_library()
    for cat in lib["categories"]:
        if cat["id"] == cat_id:
            # Check if exists
            if not any(f["name"] == name for f in cat["subfolders"]):
                cat["subfolders"].append({
                    "name": name,
                    "assets": []
                })
                save_library(lib)
            return cat
    return None

def add_asset_to_subfolder(cat_id: str, sub_name: str, asset_name: str, asset_hash: str):
    lib = load_library()
    for cat in lib["categories"]:
        if cat["id"] == cat_id:
            for sub in cat["subfolders"]:
                if sub["name"] == sub_name:
                    if not any(a["hash"] == asset_hash for a in sub["assets"]):
                        sub["assets"].append({
                            "name": asset_name,
                            "hash": asset_hash
                        })
                        save_library(lib)
                    return cat
    return None

def rename_subfolder(cat_id: str, old_name: str, new_name: str):
    lib = load_library()
    for cat in lib["categories"]:
        if cat["id"] == cat_id:
            for sub in cat["subfolders"]:
                if sub["name"] == old_name:
                    sub["name"] = new_name
                    save_library(lib)
                    return cat
    return None

def delete_subfolder(cat_id: str, name: str):
    lib = load_library()
    for cat in lib["categories"]:
        if cat["id"] == cat_id:
            initial_len = len(cat["subfolders"])
            cat["subfolders"] = [sub for sub in cat["subfolders"] if sub["name"] != name]
            if len(cat["subfolders"]) < initial_len:
                save_library(lib)
                return True
    return False
