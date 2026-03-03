"""
AI Configuration — API keys, model settings, prompts.
Supports Gemini and OpenAI providers.
"""

from __future__ import annotations
import os
from dataclasses import dataclass


@dataclass
class AIConfig:
    provider: str = "gemini"              # "gemini" | "openai"
    model: str = "gemini-2.0-flash"       # text model
    vision_model: str = "gemini-2.0-flash"  # vision model
    max_review_rounds: int = 3
    temperature: float = 0.7
    api_key: str = ""

    def __post_init__(self):
        # Try loading from env if not set
        if not self.api_key:
            if self.provider == "gemini":
                self.api_key = os.environ.get("GOOGLE_API_KEY", "")
            elif self.provider == "openai":
                self.api_key = os.environ.get("OPENAI_API_KEY", "")

    @property
    def has_api_key(self) -> bool:
        return bool(self.api_key)

    def to_dict(self) -> dict:
        return {
            "provider": self.provider,
            "model": self.model,
            "vision_model": self.vision_model,
            "max_review_rounds": self.max_review_rounds,
            "temperature": self.temperature,
            "has_api_key": self.has_api_key,
        }


# Singleton config instance
_config = AIConfig()


def get_ai_config() -> AIConfig:
    return _config


def update_ai_config(
    api_key: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    vision_model: str | None = None,
    max_review_rounds: int | None = None,
    temperature: float | None = None,
) -> AIConfig:
    global _config
    if api_key is not None:
        _config.api_key = api_key
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
    return _config
