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
from typing import Any

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
            "ollama_url": config.ollama_url,
            "local_model": config.local_model,
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
    
    # Local AI (Ollama) support
    ollama_url: str = "http://localhost:11434"
    local_model: str = "qwen2.5:7b"  # Default local model

    # Multi-key support: list of API keys for auto-fallback
    api_keys: list[str] = field(default_factory=list)
    _current_key_index: int = 0
    _quota_exhausted_until: float = 0.0
    _supported_models_cache: dict = field(default_factory=dict)

    def get_rotated_model(self, attempt: int) -> str:
        """Dynamically fetch supported models for the current API key and rotate them based on attempt."""
        current_key = self.api_key
        if not current_key:
            return self.model
            
        if current_key not in self._supported_models_cache:
            try:
                from google import genai
                client = genai.Client(api_key=current_key)
                models = [m.name.split('/')[-1] for m in client.models.list() 
                         if "generateContent" in str(getattr(m, "supported_generation_methods", [])) 
                         or "generateContent" in str(getattr(m, "supported_actions", []))]
                
                # Priority list based on latest 2026 models
                priority = [
                    "gemini-3.1-pro-preview",
                    "gemini-3.1-flash",
                    "gemini-3-pro",
                    "gemini-3-flash",
                    "gemini-2.5-flash", 
                    "gemini-2.5-pro",
                    "gemini-2.0-flash", 
                    "gemini-1.5-pro", 
                    "gemini-2.0-flash-lite"
                ]
                
                supported = []
                for p in priority:
                    for m in models:
                        if p in m and m not in supported and "image" not in m and "tts" not in m:
                            supported.append(m)
                            
                # Extra fallback if priority didn't catch anything
                if not supported:
                    supported = [m for m in models if "gemini" in m and "tts" not in m and "image" not in m][:4]
                if not supported:
                    supported = ["gemini-2.5-flash", "gemini-2.0-flash"]
                    
                self._supported_models_cache[current_key] = supported
                logger.info(f"[AIConfig] Cached {len(supported)} models for {self.current_key_label}: {supported}")
            except Exception as e:
                logger.warning(f"[AIConfig] Failed to list models for {self.current_key_label}: {e}")
                self._supported_models_cache[current_key] = ["gemini-2.5-flash", "gemini-2.0-flash"]

        candidates = self._supported_models_cache[current_key]
        return candidates[attempt % len(candidates)]

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
            if saved.get("ollama_url"):
                self.ollama_url = saved["ollama_url"]
            if saved.get("local_model"):
                self.local_model = saved["local_model"]

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
    def has_valid_quota(self) -> bool:
        import time
        if time.time() < self._quota_exhausted_until:
            return False
        return self.has_api_key

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

    def rotate_key(self, force_exhaust_all: bool = False) -> bool:
        """Switch to the next API key. Returns True if there are more keys to try."""
        import time
        if len(self.api_keys) <= 1:
            self._quota_exhausted_until = time.time() + 60.0
            return False
        
        self._current_key_index = (self._current_key_index + 1) % len(self.api_keys)
        logger.info(f"[AIConfig] Rotated to {self.current_key_label}")
        
        if force_exhaust_all or self._current_key_index == 0:
            # We looped through all keys and still failed, or explicitly exhausted
            self._quota_exhausted_until = time.time() + 60.0
            return False
            
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


async def call_local_llm(self, prompt: str, system_prompt: str = "", json_mode: bool = False) -> str:
        """Calls local Ollama instance as a fallback or for specific tasks."""
        import httpx
        try:
            payload = {
                "model": self.local_model,
                "prompt": prompt,
                "system": system_prompt,
                "stream": False,
                "options": {"temperature": 0.2}
            }
            if json_mode:
                payload["format"] = "json"

            async with httpx.AsyncClient(timeout=60.0, headers={"ngrok-skip-browser-warning": "true"}) as client:
                response = await client.post(f"{self.ollama_url}/api/generate", json=payload)
                if response.status_code == 200:
                    return response.json().get("response", "").strip()
        except Exception as e:
            logger.warning(f"[AIConfig] Local LLM call failed: {e}")
        return ""
