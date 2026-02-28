"""
SQLAlchemy ORM models for AnimeStudio.
Project stores scene/track/keyframe data as a JSON blob to match the frontend Zustand store structure.
Asset and AssetVersion provide centralized asset management with SHA-256 hashing.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship, DeclarativeBase


class Base(DeclarativeBase):
    pass


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, default="Untitled Project")
    description = Column(Text, default="")
    canvas_width = Column(Integer, default=1920)
    canvas_height = Column(Integer, default=1080)
    fps = Column(Integer, default=24)

    # Full scene/track/keyframe state stored as JSON (matches frontend editorData)
    data = Column(JSON, default=dict)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "canvas_width": self.canvas_width,
            "canvas_height": self.canvas_height,
            "fps": self.fps,
            "data": self.data,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_list_item(self):
        """Lighter representation for project listing (no full data)."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "canvas_width": self.canvas_width,
            "canvas_height": self.canvas_height,
            "fps": self.fps,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Asset(Base):
    __tablename__ = "assets"

    id = Column(String, primary_key=True, default=generate_uuid)
    hash_sha256 = Column(String, unique=True, nullable=False, index=True)
    original_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    thumbnail_path = Column(String, nullable=True)
    width = Column(Integer, default=0)
    height = Column(Integer, default=0)
    file_size = Column(Integer, default=0)
    category = Column(String, nullable=True)
    character_name = Column(String, nullable=True)
    z_index = Column(Integer, default=0)

    # P1-2.4: Soft delete flag — True means asset is in trash bin
    is_deleted = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationship to versions
    versions = relationship("AssetVersion", back_populates="asset", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "hash_sha256": self.hash_sha256,
            "original_name": self.original_name,
            "file_path": self.file_path,
            "thumbnail_path": self.thumbnail_path,
            "width": self.width,
            "height": self.height,
            "file_size": self.file_size,
            "category": self.category,
            "character_name": self.character_name,
            "z_index": self.z_index,
            "is_deleted": self.is_deleted,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AssetVersion(Base):
    __tablename__ = "asset_versions"

    id = Column(String, primary_key=True, default=generate_uuid)
    asset_id = Column(String, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    hash_sha256 = Column(String, nullable=False)
    file_path = Column(String, nullable=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    asset = relationship("Asset", back_populates="versions")

    def to_dict(self):
        return {
            "id": self.id,
            "asset_id": self.asset_id,
            "version": self.version,
            "hash_sha256": self.hash_sha256,
            "file_path": self.file_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
