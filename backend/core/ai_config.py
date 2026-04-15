"""
AI Configuration — Multi-key support, model list, and rate limit detection.
Supports Gemini and OpenAI providers.
Persists keys and settings to disk so they survive server restarts.
"""

from __future__ import annotations
import os
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════
#  PERSISTENCE
# ══════════════════════════════════════════════

# Config file lives next to the database
_CONFIG_DIR = Path(__file__).resolve().parent.parent / "data"
_CONFIG_FILE = _CONFIG_DIR / "ai_config.json"


def _load_from_disk() -> dict:
    """Load saved config from JSON file."""
    try:
        if _CONFIG_FILE.exists():
            with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                logger.info(f"[AIConfig] Loaded from {_CONFIG_FILE} ({len(data.get('api_keys', []))} keys)")
                return data
    except Exception as e:
        logger.warning(f"[AIConfig] Could not load config: {e}")
    return {}


def _save_to_disk(config: AIConfig):
    """Save config to JSON file."""
    try:
        _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        data = {
            "provider": config.provider,
            "model": config.model,
            "vision_model": config.vision_model,
            "max_review_rounds": config.max_review_rounds,
            "temperature": config.temperature,
            "api_keys": config.api_keys,
        }
        with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        logger.info(f"[AIConfig] Saved to {_CONFIG_FILE} ({len(config.api_keys)} keys)")
    except Exception as e:
        logger.warning(f"[AIConfig] Could not save config: {e}")


# ══════════════════════════════════════════════
#  AVAILABLE MODELS
# ══════════════════════════════════════════════

AVAILABLE_MODELS = [
    {"id": "gemini-2.0-flash",      "name": "Gemini 2.0 Flash",      "type": "text+vision", "tier": "free", "recommended": True},
    {"id": "gemini-2.0-flash-lite", "name": "Gemini 2.0 Flash Lite", "type": "text",        "tier": "free", "recommended": False},
    {"id": "gemini-1.5-flash",      "name": "Gemini 1.5 Flash",      "type": "text+vision", "tier": "free", "recommended": False},
    {"id": "gemini-1.5-pro",        "name": "Gemini 1.5 Pro",        "type": "text+vision", "tier": "free", "recommended": False},
]


# ══════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════

@dataclass
class AIConfig:
    provider: str = "gemini"                           # "gemini" | "openai"
    model: str = "gemini-2.0-flash"      # text model
    vision_model: str = "gemini-2.0-flash"  # vision model
    max_review_rounds: int = 3
    temperature: float = 0.7

    # Multi-key support: list of API keys for auto-fallback
    api_keys: list[str] = field(default_factory=list)
    _current_key_index: int = 0

    def __post_init__(self):
        # Load persisted config from disk first
        saved = _load_from_disk()
        if saved:
            if saved.get("api_keys"):
                self.api_keys = [k for k in saved["api_keys"] if k]
            if saved.get("model"):
                self.model = saved["model"]
            if saved.get("vision_model"):
                self.vision_model = saved["vision_model"]
            else:
                # Default vision_model to same as model
                self.vision_model = self.model
            if saved.get("provider"):
                self.provider = saved["provider"]
            if saved.get("max_review_rounds") is not None:
                self.max_review_rounds = saved["max_review_rounds"]
            if saved.get("temperature") is not None:
                self.temperature = saved["temperature"]

        # Fallback: load keys from environment if still no keys
        if not self.api_keys:
            env_key = ""
            if self.provider == "gemini":
                env_key = os.environ.get("GOOGLE_API_KEY", "")
            elif self.provider == "openai":
                env_key = os.environ.get("OPENAI_API_KEY", "")
            if env_key:
                self.api_keys = [env_key]

    @property
    def api_key(self) -> str:
        """Get the current active API key."""
        if not self.api_keys:
            return ""
        idx = self._current_key_index % len(self.api_keys)
        return self.api_keys[idx]

    @api_key.setter
    def api_key(self, value: str):
        """Set a single API key (replaces all keys)."""
        if value:
            self.api_keys = [value]
            self._current_key_index = 0
            _save_to_disk(self)

    @property
    def has_api_key(self) -> bool:
        return len(self.api_keys) > 0 and any(k for k in self.api_keys)

    @property
    def total_keys(self) -> int:
        return len(self.api_keys)

    @property
    def current_key_label(self) -> str:
        """Return a safe label like 'Key 1/3 (AIza...Xk2)'."""
        if not self.api_keys:
            return "No key"
        idx = self._current_key_index % len(self.api_keys)
        key = self.api_keys[idx]
        masked = f"{key[:4]}...{key[-3:]}" if len(key) > 7 else "***"
        return f"Key {idx + 1}/{len(self.api_keys)} ({masked})"

    def rotate_key(self) -> bool:
        """Switch to the next API key. Returns True if there are more keys to try."""
        if len(self.api_keys) <= 1:
            return False
        self._current_key_index = (self._current_key_index + 1) % len(self.api_keys)
        logger.info(f"[AIConfig] Rotated to {self.current_key_label}")
        return True

    def add_key(self, key: str):
        """Add an API key to the pool and persist."""
        if key and key not in self.api_keys:
            self.api_keys.append(key)
            logger.info(f"[AIConfig] Added key, total: {len(self.api_keys)}")
            _save_to_disk(self)

    def remove_key(self, index: int):
        """Remove an API key by index and persist."""
        if 0 <= index < len(self.api_keys):
            self.api_keys.pop(index)
            self._current_key_index = 0
            _save_to_disk(self)

    def _persist(self):
        """Force save current state to disk."""
        _save_to_disk(self)

    def to_dict(self) -> dict:
        return {
            "provider": self.provider,
            "model": self.model,
            "vision_model": self.vision_model,
            "max_review_rounds": self.max_review_rounds,
            "temperature": self.temperature,
            "has_api_key": self.has_api_key,
            "total_keys": self.total_keys,
            "current_key": self.current_key_label,
            "available_models": AVAILABLE_MODELS,
        }


# Singleton config instance
_config = AIConfig()


def get_ai_config() -> AIConfig:
    return _config


def update_ai_config(
    api_key: str | None = None,
    api_keys: list[str] | None = None,
    provider: str | None = None,
    model: str | None = None,
    vision_model: str | None = None,
    max_review_rounds: int | None = None,
    temperature: float | None = None,
) -> AIConfig:
    global _config
    if api_key is not None:
        _config.api_key = api_key
    if api_keys is not None:
        _config.api_keys = [k for k in api_keys if k]
        _config._current_key_index = 0
    if provider is not None:
        _config.provider = provider
    if model is not None:
        _config.model = model
    if vision_model is not None:
        _config.vision_model = vision_model
    if max_review_rounds is not None:
        _config.max_review_rounds = max_review_rounds
    if temperature is not None:
        _config.temperature = temperature
    _save_to_disk(_config)
    return _config
