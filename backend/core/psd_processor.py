import os
import json
import uuid
import re
import logging
from PIL import Image
from psd_tools import PSDImage
from backend.core.image_hasher import calculate_hash_from_image

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "database.json")
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
EXTRACTED_DIR = os.path.join(STORAGE_DIR, "extracted_psds")

os.makedirs(EXTRACTED_DIR, exist_ok=True)

def load_db():
    if not os.path.exists(DB_PATH):
        return []
    try:
        with open(DB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_db(data):
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

def extract_name_from_filename(filename):
    name = os.path.splitext(os.path.basename(filename))[0]
    name = re.sub(r'^\d+-', '', name)
    return name.strip()

def sanitize_filename(name):
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        name = name.replace(char, '_')
    return name.strip()

def export_layer_recursive(layer, current_path_parts, current_fs_path, char_name, layer_groups, group_order, psd_width, psd_height):
    safe_name = sanitize_filename(layer.name)
    
    # Temporarily set BOTH groups and layers to visible, otherwise child elements render transparent
    was_visible = getattr(layer, "visible", True)
    if hasattr(layer, "visible"):
        layer.visible = True
        
    if layer.is_group():
        new_fs_path = os.path.join(current_fs_path, safe_name)
        os.makedirs(new_fs_path, exist_ok=True)
        new_path_parts = current_path_parts + [safe_name]
        
        top_group = new_path_parts[0]
        if top_group not in group_order:
            group_order.append(top_group)
            layer_groups[top_group] = []
            
        for child in layer:
            export_layer_recursive(child, new_path_parts, new_fs_path, char_name, layer_groups, group_order, psd_width, psd_height)
    else:
        if layer.width == 0 or layer.height == 0:
            if hasattr(layer, "visible"):
                layer.visible = was_visible
            return
            
        try:
            image = layer.composite(force=True)
        except Exception:
            try:
                image = layer.topil()
            except Exception as e:
                logger.warning(f"Could not extract layer {safe_name}: {e}")
                if hasattr(layer, "visible"):
                    layer.visible = was_visible
                return
                
        if image:
            # Create a transparent canvas of the full PSD size and paste the layer onto it securely.
            padded_img = Image.new("RGBA", (psd_width, psd_height), (0,0,0,0))
            padded_img.paste(image, (layer.left, layer.top))
            
            # Global asset deduplication logic
            img_hash = calculate_hash_from_image(padded_img)
            filename = f"{img_hash}.png"
            
            # Save the file to the global asset pool
            asset_dir = os.path.join(STORAGE_DIR, "assets")
            save_path = os.path.join(asset_dir, filename)
            
            if not os.path.exists(save_path):
                padded_img.save(save_path)
                logger.info(f"Saved deduplicated asset pool layer: {filename}")
                
            top_group = current_path_parts[0] if current_path_parts else "Root"
            if top_group not in group_order:
                group_order.append(top_group)
                layer_groups[top_group] = []
                
            # Database references the shared static route
            url_path = f"assets/{filename}"
            
            # Avoid adding exactly the same layer twice to the JSON
            existing_layer = next((l for l in layer_groups[top_group] if l["hash"] == img_hash), None)
            if not existing_layer:
                layer_groups[top_group].append({
                    "name": safe_name,
                    "path": url_path,
                    "hash": img_hash
                })

    # Restore visibility before returning
    if hasattr(layer, "visible"):
        layer.visible = was_visible

def process_psd(file_path):
    char_name = extract_name_from_filename(file_path)
    
    logger.info(f"Opening PSD: {file_path}")
    
    try:
        psd = PSDImage.open(file_path)
    except Exception as e:
        logger.error(f"Failed to open PSD {file_path}. It might be corrupted: {e}")
        raise ValueError(f"Corrupted or invalid PSD file: {e}")
        
    char_fs_path = os.path.join(EXTRACTED_DIR, sanitize_filename(char_name))
    os.makedirs(char_fs_path, exist_ok=True)
    
    layer_groups = {}
    group_order = []
    
    try:
        for layer in psd:
            export_layer_recursive(layer, [], char_fs_path, sanitize_filename(char_name), layer_groups, group_order, psd.width, psd.height)
    except Exception as e:
        logger.error(f"Error during recursive extraction of PSD layers: {e}", exc_info=True)
        raise RuntimeError(f"Failed to extract layers from PSD: {e}")
        
    db_data = load_db()
    
    existing_char = next((c for c in db_data if c["name"] == char_name), None)
    
    if existing_char:
        # Check if group order exists for backward compatibility if old format exists
        if "group_order" not in existing_char:
            existing_char["group_order"] = []
            existing_char["layer_groups"] = {}
            
        for g in group_order:
            if g not in existing_char["group_order"]:
                existing_char["group_order"].append(g)
                existing_char["layer_groups"][g] = []
                
            for new_layer in layer_groups.get(g, []):
                existing_layers = existing_char["layer_groups"][g]
                if not any(l["hash"] == new_layer["hash"] for l in existing_layers):
                    existing_layers.append(new_layer)
        logger.info(f"Updated existing character: {char_name}")
    else:
        new_char = {
            "id": str(uuid.uuid4()),
            "name": char_name,
            "group_order": group_order,
            "layer_groups": layer_groups
        }
        db_data.append(new_char)
        logger.info(f"Created new character: {char_name}")
        
    save_db(db_data)
