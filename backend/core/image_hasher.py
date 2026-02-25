import hashlib
from PIL import Image
import io

def calculate_hash_from_image(image: Image.Image) -> str:
    """Calculate the MD5 hash of a PIL Image object."""
    hasher = hashlib.md5()
    
    # Convert image to RGB if necessary before getting bytes
    if image.mode != "RGBA" and image.mode != "RGB":
        image = image.convert("RGBA")
        
    img_byte_arr = io.BytesIO()
    # Save as PNG to get consistent bytes without compression differences
    image.save(img_byte_arr, format='PNG')
    
    hasher.update(img_byte_arr.getvalue())
    return hasher.hexdigest()

def calculate_hash_from_path(file_path: str) -> str:
    """Calculate the MD5 hash of an image file on disk."""
    hasher = hashlib.md5()
    with open(file_path, 'rb') as f:
        # Read the file in chunks to handle large files efficiently
        for chunk in iter(lambda: f.read(4096), b""):
            hasher.update(chunk)
    return hasher.hexdigest()
