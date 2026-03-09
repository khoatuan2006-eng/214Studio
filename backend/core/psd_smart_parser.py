"""
Smart PSD Parser for Jointed-Limb Character Detection.

Auto-detects PSD structure type (jointed vs flat) and extracts
body parts, expressions, viewpoints into a unified data model.
Backward compatible — falls through to flat processing for non-jointed PSDs.
"""

import os
import re
import uuid
import logging
from dataclasses import dataclass, field, asdict
from typing import Optional
from PIL import Image
from psd_tools import PSDImage

from backend.core.image_hasher import calculate_hash_from_image

logger = logging.getLogger(__name__)

# ── Keywords for body-part detection ──────────────────────────

BODY_ROOT_KEYWORDS = {"前手", "后手", "上身", "下身", "头"}
BODY_ROOT_THRESHOLD = 3  # Need at least 3 of 5 to qualify

VIEWPOINT_KEYWORDS = {"正面", "半侧", "侧面", "背面", "四分之三", "正", "侧", "背", "半侧面"}

# Leg sub-part keywords — if 下身 contains these, split into left/right
LEG_KEYWORDS = {"左腿", "右腿", "左脚", "右脚", "左", "右"}

# Expression sub-part keywords (for combinable detection)
EXPRESSION_PART_KEYWORDS = {
    "mouth": {"嘴"},
    "eyes": {"眼睛", "眼"},
    "eyebrows": {"眉毛", "眉"},
}


# ── Data Models ───────────────────────────────────────────────

@dataclass
class PartVariant:
    """A single variant/pose of a body part."""
    name: str
    layer_path: str  # path within PSD tree
    bbox: tuple  # (left, top, width, height)
    hash: str = ""
    asset_path: str = ""  # relative path to extracted PNG
    visible: bool = False


@dataclass
class BodyPart:
    """A body part with multiple variants (e.g. 前手 with 18 poses)."""
    name: str
    variants: list = field(default_factory=list)
    z_order: int = 0  # rendering order (lower = further back)


@dataclass
class HeadData:
    """Head structure with face, hair, and expression data."""
    face_shapes: list = field(default_factory=list)
    hairstyles: list = field(default_factory=list)
    expression_type: str = "pre_composed"  # "combinable" | "pre_composed"
    # Combinable expression parts
    mouths: list = field(default_factory=list)
    eyes: list = field(default_factory=list)
    eyebrows: list = field(default_factory=list)
    # Pre-composed expressions
    expressions: list = field(default_factory=list)
    # Merged expressions (表情合并 — pre-rendered single-layer versions)
    merged_expressions: list = field(default_factory=list)


@dataclass
class ViewpointData:
    """Data for a specific viewpoint (e.g. 正面, 侧面)."""
    name: str
    body_parts: dict = field(default_factory=dict)  # name -> BodyPart
    head: Optional[object] = None  # HeadData or None


@dataclass
class JointedCharacter:
    """Unified data model for a jointed-limb PSD character."""
    id: str = ""
    name: str = ""
    psd_type: str = "jointed"
    canvas_width: int = 0
    canvas_height: int = 0

    # Main body parts
    body_parts: dict = field(default_factory=dict)  # name -> BodyPart
    head: Optional[HeadData] = field(default_factory=HeadData)

    # Viewpoints (optional)
    viewpoints: dict = field(default_factory=dict)  # name -> ViewpointData

    # Backward compat fields (auto-generated)
    group_order: list = field(default_factory=list)
    layer_groups: dict = field(default_factory=dict)


# ── Utility functions ─────────────────────────────────────────

def _sanitize_filename(name: str) -> str:
    """Remove invalid filename characters."""
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        name = name.replace(char, '_')
    return name.strip()


def _extract_layer_image(layer, psd_width: int, psd_height: int) -> Optional[Image.Image]:
    """Extract a single layer as a full-canvas-sized RGBA image."""
    if layer.width == 0 or layer.height == 0:
        return None

    # Temporarily force visible
    was_visible = getattr(layer, 'visible', True)
    if hasattr(layer, 'visible'):
        layer.visible = True

    try:
        try:
            image = layer.composite(force=True)
        except Exception:
            try:
                image = layer.topil()
            except Exception as e:
                logger.warning(f"Could not extract layer {layer.name}: {e}")
                return None

        if image:
            padded = Image.new("RGBA", (psd_width, psd_height), (0, 0, 0, 0))
            padded.paste(image, (layer.left, layer.top))
            return padded
        return None
    finally:
        if hasattr(layer, 'visible'):
            layer.visible = was_visible


def _extract_group_composite(group, psd_width: int, psd_height: int) -> Optional[Image.Image]:
    """
    Composite all visible children of a group into a single image.
    Used for pre-composed expression groups that contain multiple sub-layers.
    """
    canvas = Image.new("RGBA", (psd_width, psd_height), (0, 0, 0, 0))
    has_content = False

    for child in group:
        if child.is_group():
            sub_img = _extract_group_composite(child, psd_width, psd_height)
            if sub_img:
                canvas = Image.alpha_composite(canvas, sub_img)
                has_content = True
        else:
            img = _extract_layer_image(child, psd_width, psd_height)
            if img:
                canvas = Image.alpha_composite(canvas, img)
                has_content = True

    return canvas if has_content else None


def _save_variant_image(
    image: Image.Image,
    char_name: str,
    part_path: str,
    variant_name: str,
    storage_dir: str,
) -> tuple:
    """Save a variant image and return (hash, relative_path)."""
    img_hash = calculate_hash_from_image(image)
    filename = f"{img_hash}.png"

    asset_dir = os.path.join(storage_dir, "assets")
    os.makedirs(asset_dir, exist_ok=True)
    save_path = os.path.join(asset_dir, filename)

    if not os.path.exists(save_path):
        image.save(save_path)
        logger.info(f"Saved jointed variant: {part_path}/{variant_name} -> {filename}")

    # Thumbnail
    thumb_dir = os.path.join(storage_dir, "thumbnails")
    os.makedirs(thumb_dir, exist_ok=True)
    thumb_path = os.path.join(thumb_dir, f"{img_hash}_thumb.png")
    if not os.path.exists(thumb_path):
        try:
            thumb = image.copy()
            thumb.thumbnail((128, 128), Image.LANCZOS)
            thumb.save(thumb_path)
        except Exception as e:
            logger.warning(f"Failed to generate thumbnail: {e}")

    return img_hash, f"assets/{filename}"


# ── Detection logic ───────────────────────────────────────────

def _is_body_root(group) -> bool:
    """Check if a group qualifies as a body root (has ≥3 of the 5 body part keywords)."""
    if not group.is_group():
        return False
    child_names = {child.name.strip() for child in group}
    matches = child_names & BODY_ROOT_KEYWORDS
    return len(matches) >= BODY_ROOT_THRESHOLD


def _is_viewpoint_group(group) -> bool:
    """Check if a group is a viewpoint (name matches viewpoint keywords)."""
    if not group.is_group():
        return False
    name = group.name.strip()
    return name in VIEWPOINT_KEYWORDS


def _detect_expression_type(expression_group) -> str:
    """
    Determine if expressions are combinable or pre-composed.
    
    Combinable: children are sub-groups named 嘴/眼睛/眉毛, each containing leaf layers.
    Pre-composed: children are groups named after emotions (开心, 难过, etc.), each a complete expression.
    """
    if not expression_group.is_group():
        return "pre_composed"

    children = list(expression_group)
    if not children:
        return "pre_composed"

    child_names = {child.name.strip() for child in children if child.is_group()}

    # Check if children match expression part keywords (嘴, 眼睛, 眉毛)
    all_part_names = set()
    for part_keywords in EXPRESSION_PART_KEYWORDS.values():
        all_part_names |= part_keywords

    matches = child_names & all_part_names
    if len(matches) >= 2:  # At least mouth + eyes → combinable
        return "combinable"

    return "pre_composed"


def detect_psd_type(psd: PSDImage) -> str:
    """
    Detect whether a PSD is jointed or flat.
    Returns "jointed" if any top-level group qualifies as a body root.
    """
    for layer in psd:
        if _is_body_root(layer):
            return "jointed"
    return "flat"


# ── Parsing logic ─────────────────────────────────────────────

def _parse_body_part(group, psd_width: int, psd_height: int, storage_dir: str,
                     char_name: str, part_path: str, z_order: int) -> BodyPart:
    """Parse a body part group into a BodyPart with extracted variants."""
    part = BodyPart(name=group.name.strip(), z_order=z_order)

    for child in group:
        variant_name = child.name.strip()

        if child.is_group():
            # Sub-group within body part — composite all children
            img = _extract_group_composite(child, psd_width, psd_height)
        else:
            img = _extract_layer_image(child, psd_width, psd_height)

        if img is None:
            continue

        img_hash, asset_path = _save_variant_image(
            img, char_name, part_path, variant_name, storage_dir
        )

        bbox = _get_layer_bbox(child, psd_width, psd_height)

        variant = PartVariant(
            name=variant_name,
            layer_path=f"{part_path}/{variant_name}",
            bbox=bbox,
            hash=img_hash,
            asset_path=asset_path,
            visible=getattr(child, 'visible', False),
        )
        part.variants.append(variant)

    return part


def _get_layer_bbox(layer, psd_width, psd_height) -> tuple:
    """Get actual bounding box of a layer/group as (left, top, width, height)."""
    try:
        if hasattr(layer, 'bbox') and layer.bbox:
            left, top, right, bottom = layer.bbox
            if right > left and bottom > top:
                return (left, top, right - left, bottom - top)
    except Exception:
        pass
    return (0, 0, psd_width, psd_height)


def _parse_lower_body(group, psd_width, psd_height, storage_dir, char_name, part_path, z_order) -> dict:
    """
    Parse 下身 group. If it contains sub-groups for left/right legs,
    split into separate BodyPart entries. Otherwise treat as single part.
    """
    result = {}
    children = list(group)
    
    # Check if any children have leg-related names
    has_leg_split = False
    for child in children:
        child_name = child.name.strip()
        if child.is_group() and any(kw in child_name for kw in LEG_KEYWORDS):
            has_leg_split = True
            break
    
    if has_leg_split:
        # Split into separate body parts for each sub-group
        sub_z = z_order
        for child in children:
            child_name = child.name.strip()
            if child.is_group():
                bp = _parse_body_part(child, psd_width, psd_height, storage_dir,
                                     char_name, f"{part_path}/{child_name}", sub_z)
                result[child_name] = bp
                sub_z += 1
            else:
                # Single layer under 下身 (e.g. shared element)
                img = _extract_layer_image(child, psd_width, psd_height)
                if img:
                    h, p = _save_variant_image(img, char_name, part_path, child_name, storage_dir)
                    bp = BodyPart(name=child_name, z_order=sub_z)
                    bp.variants.append(PartVariant(
                        name=child_name,
                        layer_path=f"{part_path}/{child_name}",
                        bbox=_get_layer_bbox(child, psd_width, psd_height),
                        hash=h, asset_path=p,
                        visible=getattr(child, 'visible', False),
                    ))
                    result[child_name] = bp
                    sub_z += 1
    else:
        # No leg split — treat 下身 as single body part
        bp = _parse_body_part(group, psd_width, psd_height, storage_dir, char_name, part_path, z_order)
        result[group.name.strip()] = bp
    
    return result


def _parse_head(head_group, psd_width: int, psd_height: int,
                storage_dir: str, char_name: str, part_path: str) -> HeadData:
    """Parse the 头 group into HeadData."""
    head = HeadData()

    for child in head_group:
        child_name = child.name.strip()

        if child_name == "脸型":
            # Face shapes
            if child.is_group():
                for face in child:
                    if face.is_group():
                        img = _extract_group_composite(face, psd_width, psd_height)
                    else:
                        img = _extract_layer_image(face, psd_width, psd_height)
                    if img:
                        h, p = _save_variant_image(img, char_name, f"{part_path}/脸型", face.name.strip(), storage_dir)
                        head.face_shapes.append(PartVariant(
                            name=face.name.strip(),
                            layer_path=f"{part_path}/脸型/{face.name.strip()}",
                            bbox=_get_layer_bbox(face, psd_width, psd_height),
                            hash=h, asset_path=p,
                            visible=getattr(face, 'visible', False),
                        ))

        elif child_name == "发型":
            # Hairstyles
            if child.is_group():
                for hair in child:
                    if hair.is_group():
                        img = _extract_group_composite(hair, psd_width, psd_height)
                    else:
                        img = _extract_layer_image(hair, psd_width, psd_height)
                    if img:
                        h, p = _save_variant_image(img, char_name, f"{part_path}/发型", hair.name.strip(), storage_dir)
                        head.hairstyles.append(PartVariant(
                            name=hair.name.strip(),
                            layer_path=f"{part_path}/发型/{hair.name.strip()}",
                            bbox=_get_layer_bbox(hair, psd_width, psd_height),
                            hash=h, asset_path=p,
                            visible=getattr(hair, 'visible', False),
                        ))

        elif child_name == "表情":
            # Detect expression type
            expr_type = _detect_expression_type(child)
            head.expression_type = expr_type

            if expr_type == "combinable":
                _parse_combinable_expressions(head, child, psd_width, psd_height, storage_dir, char_name, part_path)
            else:
                _parse_precomposed_expressions(head, child, psd_width, psd_height, storage_dir, char_name, part_path)

        elif "表情" in child_name and "合并" in child_name:
            # 表情（合并）— merged expressions (single-layer pre-rendered)
            if child.is_group():
                for expr in child:
                    if expr.is_group():
                        img = _extract_group_composite(expr, psd_width, psd_height)
                    else:
                        img = _extract_layer_image(expr, psd_width, psd_height)
                    if img:
                        h, p = _save_variant_image(img, char_name, f"{part_path}/表情合并", expr.name.strip(), storage_dir)
                        head.merged_expressions.append(PartVariant(
                            name=expr.name.strip(),
                            layer_path=f"{part_path}/表情合并/{expr.name.strip()}",
                            bbox=_get_layer_bbox(expr, psd_width, psd_height),
                            hash=h, asset_path=p,
                            visible=getattr(expr, 'visible', False),
                        ))

    return head


def _parse_combinable_expressions(head: HeadData, expr_group, psd_width, psd_height,
                                   storage_dir, char_name, part_path):
    """Parse combinable expressions (嘴 × 眼睛 × 眉毛)."""
    for child in expr_group:
        child_name = child.name.strip()
        if not child.is_group():
            continue

        target_list = None
        sub_path = child_name

        # Match to expression part
        for part_key, keywords in EXPRESSION_PART_KEYWORDS.items():
            if child_name in keywords:
                if part_key == "mouth":
                    target_list = head.mouths
                elif part_key == "eyes":
                    target_list = head.eyes
                elif part_key == "eyebrows":
                    target_list = head.eyebrows
                break

        if target_list is None:
            continue

        for item in child:
            item_name = item.name.strip()
            if item.is_group():
                img = _extract_group_composite(item, psd_width, psd_height)
            else:
                img = _extract_layer_image(item, psd_width, psd_height)
            if img:
                h, p = _save_variant_image(img, char_name, f"{part_path}/表情/{sub_path}", item_name, storage_dir)
                target_list.append(PartVariant(
                    name=item_name,
                    layer_path=f"{part_path}/表情/{sub_path}/{item_name}",
                    bbox=_get_layer_bbox(item, psd_width, psd_height),
                    hash=h, asset_path=p,
                    visible=getattr(item, 'visible', False),
                ))


def _parse_precomposed_expressions(head: HeadData, expr_group, psd_width, psd_height,
                                    storage_dir, char_name, part_path):
    """Parse pre-composed expressions (each child group is a complete expression)."""
    for child in expr_group:
        child_name = child.name.strip()

        if child.is_group():
            img = _extract_group_composite(child, psd_width, psd_height)
        else:
            img = _extract_layer_image(child, psd_width, psd_height)

        if img:
            h, p = _save_variant_image(img, char_name, f"{part_path}/表情", child_name, storage_dir)
            head.expressions.append(PartVariant(
                name=child_name,
                layer_path=f"{part_path}/表情/{child_name}",
                bbox=_get_layer_bbox(child, psd_width, psd_height),
                hash=h, asset_path=p,
                visible=getattr(child, 'visible', False),
            ))


def _parse_viewpoint(vp_group, psd_width, psd_height, storage_dir, char_name) -> ViewpointData:
    """Parse a viewpoint group (e.g. 正面, 侧面)."""
    vp_name = vp_group.name.strip()
    vp = ViewpointData(name=vp_name)
    vp_path = vp_name

    z_order = 0
    for child in vp_group:
        child_name = child.name.strip()

        if child_name == "头" and child.is_group():
            vp.head = _parse_head(child, psd_width, psd_height, storage_dir, char_name, f"{vp_path}/头")
        elif child.is_group():
            bp = _parse_body_part(child, psd_width, psd_height, storage_dir, char_name, f"{vp_path}/{child_name}", z_order)
            vp.body_parts[child_name] = bp
        else:
            # Single layer under viewpoint
            img = _extract_layer_image(child, psd_width, psd_height)
            if img:
                h, p = _save_variant_image(img, char_name, vp_path, child_name, storage_dir)
                bp = BodyPart(name=child_name, z_order=z_order)
                bp.variants.append(PartVariant(
                    name=child_name,
                    layer_path=f"{vp_path}/{child_name}",
                    bbox=_get_layer_bbox(child, psd_width, psd_height),
                    hash=h, asset_path=p,
                    visible=getattr(child, 'visible', False),
                ))
                vp.body_parts[child_name] = bp
        z_order += 1

    return vp


# ── Main parse function ──────────────────────────────────────

def parse_jointed_psd(psd: PSDImage, char_name: str, storage_dir: str) -> JointedCharacter:
    """
    Parse a jointed-limb PSD into a JointedCharacter data model.
    
    This function auto-detects body roots, viewpoints, expression types,
    and extracts all variants as individual PNG files.
    """
    result = JointedCharacter(
        id=str(uuid.uuid4()),
        name=char_name,
        psd_type="jointed",
        canvas_width=psd.width,
        canvas_height=psd.height,
    )

    # Z-order mapping for standard body parts
    BODY_Z_ORDER = {"后手": 0, "下身": 1, "左腿": 1, "右腿": 2, "上身": 3, "头": 4, "衣服": 5, "配饰": 6, "鞋子": 7, "前手": 8}

    for top_layer in psd:
        top_name = top_layer.name.strip()

        if _is_viewpoint_group(top_layer):
            # Viewpoint group (正面, 侧面, etc.)
            logger.info(f"Detected viewpoint: {top_name}")
            vp = _parse_viewpoint(top_layer, psd.width, psd.height, storage_dir, char_name)
            result.viewpoints[top_name] = vp

        elif _is_body_root(top_layer):
            # Body root — parse each child as a body part
            logger.info(f"Detected body root: {top_name}")
            
            # First check: does this body root contain viewpoint sub-groups?
            has_viewpoints = any(
                _is_viewpoint_group(child) for child in top_layer
            )
            
            if has_viewpoints:
                # Body root contains viewpoints (e.g. 正面/侧面/背面 inside character group)
                logger.info(f"Body root {top_name} contains viewpoints — parsing as multi-viewpoint")
                for child in top_layer:
                    child_name = child.name.strip()
                    if _is_viewpoint_group(child):
                        vp = _parse_viewpoint(child, psd.width, psd.height, storage_dir, char_name)
                        result.viewpoints[child_name] = vp
                        # Use first viewpoint as default body_parts + head
                        if not result.body_parts and vp.body_parts:
                            result.body_parts = dict(vp.body_parts)
                        if result.head is None and vp.head:
                            result.head = vp.head
                    elif child.is_group():
                        # Non-viewpoint groups at body-root level (e.g. shared layers)
                        z_order = BODY_Z_ORDER.get(child_name, 10)
                        if child_name == "头" and child.is_group():
                            result.head = _parse_head(
                                child, psd.width, psd.height, storage_dir,
                                char_name, f"{top_name}/头"
                            )
                        else:
                            bp = _parse_body_part(
                                child, psd.width, psd.height, storage_dir,
                                char_name, f"{top_name}/{child_name}", z_order
                            )
                            result.body_parts[child_name] = bp
            else:
                # Normal body root — parse flat
                for child in top_layer:
                    child_name = child.name.strip()
                    z_order = BODY_Z_ORDER.get(child_name, 10)

                    if child_name == "头" and child.is_group():
                        result.head = _parse_head(
                            child, psd.width, psd.height, storage_dir,
                            char_name, f"{top_name}/头"
                        )
                    elif child_name == "下身" and child.is_group():
                        # Special handling: check for left/right leg split
                        lower_parts = _parse_lower_body(
                            child, psd.width, psd.height, storage_dir,
                            char_name, f"{top_name}/下身", z_order
                        )
                        result.body_parts.update(lower_parts)
                    elif child.is_group():
                        bp = _parse_body_part(
                            child, psd.width, psd.height, storage_dir,
                            char_name, f"{top_name}/{child_name}", z_order
                        )
                        result.body_parts[child_name] = bp
                    else:
                        # Single layer under body root (e.g. clothing elements)
                        img = _extract_layer_image(child, psd.width, psd.height)
                        if img:
                            h, p = _save_variant_image(img, char_name, top_name, child_name, storage_dir)
                            bp = BodyPart(name=child_name, z_order=z_order)
                            bp.variants.append(PartVariant(
                                name=child_name,
                                layer_path=f"{top_name}/{child_name}",
                                bbox=_get_layer_bbox(child, psd.width, psd.height),
                                hash=h, asset_path=p,
                                visible=getattr(child, 'visible', False),
                            ))
                            result.body_parts[child_name] = bp
        
        elif top_layer.is_group():
            # Unknown top-level group — check if it's a body-root candidate
            # (might have fewer than 3 matching keywords, or different naming)
            child_groups = [c for c in top_layer if c.is_group()]
            if child_groups:
                logger.info(f"Parsing unrecognized top-level group as body root: {top_name}")
                for child in top_layer:
                    child_name = child.name.strip()
                    z_order = BODY_Z_ORDER.get(child_name, 10)
                    
                    if child_name == "头" and child.is_group():
                        if result.head is None or not result.head.face_shapes:
                            result.head = _parse_head(
                                child, psd.width, psd.height, storage_dir,
                                char_name, f"{top_name}/头"
                            )
                    elif child.is_group():
                        bp = _parse_body_part(
                            child, psd.width, psd.height, storage_dir,
                            char_name, f"{top_name}/{child_name}", z_order
                        )
                        if child_name not in result.body_parts:
                            result.body_parts[child_name] = bp
                    else:
                        img = _extract_layer_image(child, psd.width, psd.height)
                        if img:
                            h, p = _save_variant_image(img, char_name, top_name, child_name, storage_dir)
                            bp = BodyPart(name=child_name, z_order=z_order)
                            bp.variants.append(PartVariant(
                                name=child_name,
                                layer_path=f"{top_name}/{child_name}",
                                bbox=_get_layer_bbox(child, psd.width, psd.height),
                                hash=h, asset_path=p,
                                visible=getattr(child, 'visible', False),
                            ))
                            if child_name not in result.body_parts:
                                result.body_parts[child_name] = bp

    # ── Generate backward-compat fields ──
    _generate_compat_fields(result)

    logger.info(
        f"Parsed jointed PSD: {char_name}, "
        f"body_parts={list(result.body_parts.keys())}, "
        f"viewpoints={list(result.viewpoints.keys())}, "
        f"expression_type={result.head.expression_type if result.head else 'none'}"
    )

    return result


def _generate_compat_fields(result: JointedCharacter):
    """
    Generate group_order and layer_groups for backward compatibility.
    This allows the existing frontend to still render the character
    using the old flat model while the new UI is being built.
    """
    group_order = []
    layer_groups = {}

    # Body parts
    sorted_parts = sorted(result.body_parts.items(), key=lambda x: x[1].z_order)
    for part_name, part in sorted_parts:
        group_order.append(part_name)
        layer_groups[part_name] = [
            {"name": v.name, "path": v.asset_path, "hash": v.hash}
            for v in part.variants
        ]

    # Head expressions
    if result.head:
        if result.head.expression_type == "combinable":
            if result.head.mouths:
                group_order.append("嘴")
                layer_groups["嘴"] = [
                    {"name": v.name, "path": v.asset_path, "hash": v.hash}
                    for v in result.head.mouths
                ]
            if result.head.eyes:
                group_order.append("眼睛")
                layer_groups["眼睛"] = [
                    {"name": v.name, "path": v.asset_path, "hash": v.hash}
                    for v in result.head.eyes
                ]
            if result.head.eyebrows:
                group_order.append("眉毛")
                layer_groups["眉毛"] = [
                    {"name": v.name, "path": v.asset_path, "hash": v.hash}
                    for v in result.head.eyebrows
                ]
        else:
            # Use merged expressions if available, else pre-composed
            exprs = result.head.merged_expressions or result.head.expressions
            if exprs:
                group_order.append("表情")
                layer_groups["表情"] = [
                    {"name": v.name, "path": v.asset_path, "hash": v.hash}
                    for v in exprs
                ]

        # Face & hair
        if result.head.face_shapes:
            group_order.append("脸型")
            layer_groups["脸型"] = [
                {"name": v.name, "path": v.asset_path, "hash": v.hash}
                for v in result.head.face_shapes
            ]
        if result.head.hairstyles:
            group_order.append("发型")
            layer_groups["发型"] = [
                {"name": v.name, "path": v.asset_path, "hash": v.hash}
                for v in result.head.hairstyles
            ]

    result.group_order = group_order
    result.layer_groups = layer_groups


# ── Serialization ─────────────────────────────────────────────

def jointed_char_to_dict(jc: JointedCharacter) -> dict:
    """Convert a JointedCharacter to a JSON-serializable dict."""
    def _variant_to_dict(v: PartVariant) -> dict:
        return {
            "name": v.name,
            "layer_path": v.layer_path,
            "bbox": list(v.bbox),
            "hash": v.hash,
            "asset_path": v.asset_path,
            "visible": v.visible,
        }

    def _body_part_to_dict(bp: BodyPart) -> dict:
        return {
            "name": bp.name,
            "z_order": bp.z_order,
            "variants": [_variant_to_dict(v) for v in bp.variants],
        }

    def _head_to_dict(h: HeadData) -> dict:
        d = {
            "expression_type": h.expression_type,
            "face_shapes": [_variant_to_dict(v) for v in h.face_shapes],
            "hairstyles": [_variant_to_dict(v) for v in h.hairstyles],
        }
        if h.expression_type == "combinable":
            d["mouths"] = [_variant_to_dict(v) for v in h.mouths]
            d["eyes"] = [_variant_to_dict(v) for v in h.eyes]
            d["eyebrows"] = [_variant_to_dict(v) for v in h.eyebrows]
        else:
            d["expressions"] = [_variant_to_dict(v) for v in h.expressions]
        if h.merged_expressions:
            d["merged_expressions"] = [_variant_to_dict(v) for v in h.merged_expressions]
        return d

    def _viewpoint_to_dict(vp: ViewpointData) -> dict:
        return {
            "name": vp.name,
            "body_parts": {k: _body_part_to_dict(v) for k, v in vp.body_parts.items()},
            "head": _head_to_dict(vp.head) if vp.head else None,
        }

    return {
        "id": jc.id,
        "name": jc.name,
        "psd_type": jc.psd_type,
        "canvas_size": [jc.canvas_width, jc.canvas_height],
        "body_parts": {k: _body_part_to_dict(v) for k, v in jc.body_parts.items()},
        "head": _head_to_dict(jc.head) if jc.head else None,
        "viewpoints": {k: _viewpoint_to_dict(v) for k, v in jc.viewpoints.items()} if jc.viewpoints else None,
        # Backward compat
        "group_order": jc.group_order,
        "layer_groups": jc.layer_groups,
    }
