#!/usr/bin/env python3
"""
Migration Script: MD5 → SHA-256
================================
Scans storage/assets/ for files named with MD5 hashes (32 hex chars),
re-hashes them with SHA-256, renames files + thumbnails, and updates
all references in database.json, custom_library.json, and SQLite.

Usage:
    python scripts/migrate_md5_to_sha256.py             # Execute migration
    python scripts/migrate_md5_to_sha256.py --dry-run    # Preview changes only
"""

import os
import sys
import re
import json
import shutil
import argparse
import logging

# Setup path so we can import backend modules
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, PROJECT_ROOT)

from backend.core.image_hasher import calculate_hash_from_path
from backend.core.database import SessionLocal
from backend.core.models import Asset

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("migrate_md5_to_sha256")

BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
ASSETS_DIR = os.path.join(BACKEND_DIR, "storage", "assets")
THUMBNAILS_DIR = os.path.join(BACKEND_DIR, "storage", "thumbnails")
DB_JSON_PATH = os.path.join(BACKEND_DIR, "data", "database.json")
LIBRARY_JSON_PATH = os.path.join(BACKEND_DIR, "data", "custom_library.json")

MD5_PATTERN = re.compile(r"^[a-f0-9]{32}$")
SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")


def is_md5_hash(name: str) -> bool:
    return bool(MD5_PATTERN.match(name))


def is_sha256_hash(name: str) -> bool:
    return bool(SHA256_PATTERN.match(name))


def scan_md5_assets() -> list[dict]:
    """Find all assets with MD5-style filenames."""
    md5_files = []
    if not os.path.isdir(ASSETS_DIR):
        logger.warning(f"Assets directory not found: {ASSETS_DIR}")
        return md5_files

    for filename in os.listdir(ASSETS_DIR):
        name, ext = os.path.splitext(filename)
        if ext.lower() == ".png" and is_md5_hash(name):
            full_path = os.path.join(ASSETS_DIR, filename)
            md5_files.append({
                "md5_hash": name,
                "filename": filename,
                "full_path": full_path,
            })

    return md5_files


def compute_sha256_mapping(md5_files: list[dict]) -> dict[str, str]:
    """Compute SHA-256 hash for each MD5 file. Returns {md5: sha256}."""
    mapping = {}
    for entry in md5_files:
        sha256 = calculate_hash_from_path(entry["full_path"])
        mapping[entry["md5_hash"]] = sha256
        logger.info(f"  {entry['md5_hash']} → {sha256}")
    return mapping


def rename_asset_files(mapping: dict[str, str], dry_run: bool) -> int:
    """Rename asset PNGs from MD5 to SHA-256 filenames."""
    renamed = 0
    for md5, sha256 in mapping.items():
        old_path = os.path.join(ASSETS_DIR, f"{md5}.png")
        new_path = os.path.join(ASSETS_DIR, f"{sha256}.png")

        if not os.path.exists(old_path):
            continue

        if os.path.exists(new_path):
            logger.warning(f"  SHA-256 file already exists, removing MD5 duplicate: {md5}")
            if not dry_run:
                os.remove(old_path)
            renamed += 1
            continue

        logger.info(f"  Rename asset: {md5}.png → {sha256}.png")
        if not dry_run:
            shutil.move(old_path, new_path)
        renamed += 1

    return renamed


def rename_thumbnails(mapping: dict[str, str], dry_run: bool) -> int:
    """Rename thumbnail files from MD5 to SHA-256."""
    renamed = 0
    if not os.path.isdir(THUMBNAILS_DIR):
        return renamed

    for md5, sha256 in mapping.items():
        old_thumb = os.path.join(THUMBNAILS_DIR, f"{md5}_thumb.png")
        new_thumb = os.path.join(THUMBNAILS_DIR, f"{sha256}_thumb.png")

        if not os.path.exists(old_thumb):
            continue

        if os.path.exists(new_thumb):
            logger.warning(f"  SHA-256 thumbnail already exists, removing MD5 duplicate: {md5}_thumb")
            if not dry_run:
                os.remove(old_thumb)
            renamed += 1
            continue

        logger.info(f"  Rename thumbnail: {md5}_thumb.png → {sha256}_thumb.png")
        if not dry_run:
            shutil.move(old_thumb, new_thumb)
        renamed += 1

    return renamed


def update_database_json(mapping: dict[str, str], dry_run: bool) -> int:
    """Replace MD5 hashes with SHA-256 in database.json (characters)."""
    if not os.path.exists(DB_JSON_PATH):
        logger.info("  database.json not found, skipping")
        return 0

    with open(DB_JSON_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    original = content
    replacements = 0

    for md5, sha256 in mapping.items():
        count = content.count(md5)
        if count > 0:
            content = content.replace(md5, sha256)
            replacements += count
            logger.info(f"  database.json: replaced {count} occurrence(s) of {md5}")

    if replacements > 0 and not dry_run:
        with open(DB_JSON_PATH, "w", encoding="utf-8") as f:
            f.write(content)

    return replacements


def update_library_json(mapping: dict[str, str], dry_run: bool) -> int:
    """Replace MD5 hashes with SHA-256 in custom_library.json."""
    if not os.path.exists(LIBRARY_JSON_PATH):
        logger.info("  custom_library.json not found, skipping")
        return 0

    with open(LIBRARY_JSON_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    replacements = 0

    for md5, sha256 in mapping.items():
        count = content.count(md5)
        if count > 0:
            content = content.replace(md5, sha256)
            replacements += count
            logger.info(f"  custom_library.json: replaced {count} occurrence(s) of {md5}")

    if replacements > 0 and not dry_run:
        with open(LIBRARY_JSON_PATH, "w", encoding="utf-8") as f:
            f.write(content)

    return replacements


def update_sqlite(mapping: dict[str, str], dry_run: bool) -> int:
    """Update or insert asset records in SQLite."""
    updated = 0
    db = SessionLocal()

    try:
        for md5, sha256 in mapping.items():
            # Check if there's already an asset with the old MD5 as hash
            old_asset = db.query(Asset).filter(Asset.hash_sha256 == md5).first()
            sha256_exists = db.query(Asset).filter(Asset.hash_sha256 == sha256).first()

            if old_asset and not sha256_exists:
                logger.info(f"  SQLite: updating asset hash {md5} → {sha256}")
                if not dry_run:
                    old_asset.hash_sha256 = sha256
                    old_asset.file_path = f"assets/{sha256}.png"
                    old_asset.thumbnail_path = f"thumbnails/{sha256}_thumb.png"
                    db.commit()
                updated += 1
            elif old_asset and sha256_exists:
                logger.info(f"  SQLite: SHA-256 record already exists, removing MD5 record for {md5}")
                if not dry_run:
                    db.delete(old_asset)
                    db.commit()
                updated += 1
            elif not old_asset and not sha256_exists:
                # No record for either — create new with SHA-256
                asset_path = os.path.join(ASSETS_DIR, f"{sha256}.png")
                if os.path.exists(asset_path) or dry_run:
                    logger.info(f"  SQLite: creating new asset record for {sha256}")
                    if not dry_run:
                        file_size = os.path.getsize(asset_path) if os.path.exists(asset_path) else 0
                        new_asset = Asset(
                            hash_sha256=sha256,
                            original_name=f"migrated_{md5[:8]}",
                            file_path=f"assets/{sha256}.png",
                            thumbnail_path=f"thumbnails/{sha256}_thumb.png",
                            file_size=file_size,
                        )
                        db.add(new_asset)
                        db.commit()
                    updated += 1
    finally:
        db.close()

    return updated


def main():
    parser = argparse.ArgumentParser(
        description="Migrate asset files from MD5 to SHA-256 hashing"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without modifying any files",
    )
    args = parser.parse_args()

    mode_label = "DRY RUN" if args.dry_run else "LIVE"
    logger.info(f"=== MD5 → SHA-256 Migration ({mode_label}) ===")
    logger.info("")

    # Step 1: Scan for MD5 assets
    logger.info("Step 1: Scanning for MD5-hashed assets...")
    md5_files = scan_md5_assets()
    logger.info(f"  Found {len(md5_files)} MD5-hashed asset(s)")

    if not md5_files:
        logger.info("No MD5 assets found. Nothing to migrate!")
        logger.info("=== Migration complete ===")
        return

    # Step 2: Compute SHA-256 for each
    logger.info("")
    logger.info("Step 2: Computing SHA-256 hashes...")
    mapping = compute_sha256_mapping(md5_files)

    # Step 3: Rename asset files
    logger.info("")
    logger.info("Step 3: Renaming asset files...")
    renamed_assets = rename_asset_files(mapping, args.dry_run)

    # Step 4: Rename thumbnails
    logger.info("")
    logger.info("Step 4: Renaming thumbnails...")
    renamed_thumbs = rename_thumbnails(mapping, args.dry_run)

    # Step 5: Update database.json
    logger.info("")
    logger.info("Step 5: Updating database.json...")
    json_replacements = update_database_json(mapping, args.dry_run)

    # Step 6: Update custom_library.json
    logger.info("")
    logger.info("Step 6: Updating custom_library.json...")
    lib_replacements = update_library_json(mapping, args.dry_run)

    # Step 7: Update SQLite
    logger.info("")
    logger.info("Step 7: Updating SQLite database...")
    sqlite_updates = update_sqlite(mapping, args.dry_run)

    # Report
    logger.info("")
    logger.info("=" * 50)
    logger.info(f"  Migration Report ({mode_label})")
    logger.info("=" * 50)
    logger.info(f"  MD5 assets found:        {len(md5_files)}")
    logger.info(f"  Asset files renamed:     {renamed_assets}")
    logger.info(f"  Thumbnails renamed:      {renamed_thumbs}")
    logger.info(f"  database.json updates:   {json_replacements}")
    logger.info(f"  library.json updates:    {lib_replacements}")
    logger.info(f"  SQLite records updated:  {sqlite_updates}")
    logger.info("=" * 50)

    if args.dry_run:
        logger.info("This was a DRY RUN. No files were modified.")
        logger.info("Run without --dry-run to apply changes.")


if __name__ == "__main__":
    main()
