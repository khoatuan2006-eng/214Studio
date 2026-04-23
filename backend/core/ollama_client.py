"""
Ollama Local LLM Client — Local AI inference for non-vision tasks.
Provides fallback and primary interface for Swarm Critic, Negotiator,
and Smart Resolver functions to avoid excessive API quota consumption.
"""

import asyncio
import json
import logging
from typing import Optional

try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger(__name__)


class OllamaClient:
    """Wrapper for Ollama API (runs locally at http://localhost:11434)."""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen2.5:7b", timeout: float = 60.0):
        self.base_url = base_url
        self.model = model
        self.timeout = timeout
        self._health_checked = False
        self._is_healthy = False

    async def is_available(self) -> bool:
        """Check if Ollama server is running and healthy."""
        if self._health_checked:
            return self._is_healthy

        try:
            if httpx is None:
                logger.warning("[Ollama] httpx not available, skipping health check.")
                self._is_healthy = False
                self._health_checked = True
                return False

            async with httpx.AsyncClient(timeout=5.0, headers={"ngrok-skip-browser-warning": "true"}) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                self._is_healthy = response.status_code == 200
                logger.info(f"[Ollama] Health check: {'✓ Available' if self._is_healthy else '✗ Unavailable'}")
        except Exception as e:
            logger.warning(f"[Ollama] Health check failed: {e}")
            self._is_healthy = False

        self._health_checked = True
        return self._is_healthy

    async def generate(
        self,
        prompt: str,
        system: str = "",
        json_mode: bool = False,
        temperature: float = 0.2,
    ) -> Optional[str]:
        """Generate text using local Ollama model."""
        if httpx is None:
            logger.warning("[Ollama] httpx not available.")
            return None

        try:
            if not await self.is_available():
                logger.warning("[Ollama] Server not available.")
                return None

            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": temperature},
            }

            if system:
                payload["system"] = system

            async with httpx.AsyncClient(timeout=self.timeout, headers={"ngrok-skip-browser-warning": "true"}) as client:
                response = await client.post(f"{self.base_url}/api/generate", json=payload)

                if response.status_code == 200:
                    result = response.json()
                    text = result.get("response", "").strip()
                    
                    # If JSON mode was requested, try to parse and re-serialize
                    if json_mode and text:
                        try:
                            parsed = json.loads(text)
                            return json.dumps(parsed, ensure_ascii=False)
                        except json.JSONDecodeError:
                            # If parsing fails, return as-is (might not be valid JSON)
                            logger.warning("[Ollama] JSON mode requested but response is not valid JSON.")
                    
                    return text
                else:
                    logger.error(f"[Ollama] API error: {response.status_code} - {response.text}")
                    return None

        except asyncio.TimeoutError:
            logger.error("[Ollama] Request timed out.")
            return None
        except Exception as e:
            logger.error(f"[Ollama] Generation failed: {e}")
            return None

    async def chat(
        self,
        messages: list[dict],
        system: str = "",
        json_mode: bool = False,
        temperature: float = 0.2,
    ) -> Optional[str]:
        """Chat-mode generation (message-based interface)."""
        if httpx is None:
            logger.warning("[Ollama] httpx not available.")
            return None

        try:
            if not await self.is_available():
                logger.warning("[Ollama] Server not available.")
                return None

            payload = {
                "model": self.model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature},
            }

            if system:
                payload["system"] = system

            async with httpx.AsyncClient(timeout=self.timeout, headers={"ngrok-skip-browser-warning": "true"}) as client:
                response = await client.post(f"{self.base_url}/api/chat", json=payload)

                if response.status_code == 200:
                    result = response.json()
                    text = result.get("message", {}).get("content", "").strip()
                    
                    if json_mode and text:
                        try:
                            parsed = json.loads(text)
                            return json.dumps(parsed, ensure_ascii=False)
                        except json.JSONDecodeError:
                            logger.warning("[Ollama] JSON mode requested but response is not valid JSON.")
                    
                    return text
                else:
                    logger.error(f"[Ollama] API error: {response.status_code} - {response.text}")
                    return None

        except asyncio.TimeoutError:
            logger.error("[Ollama] Chat request timed out.")
            return None
        except Exception as e:
            logger.error(f"[Ollama] Chat generation failed: {e}")
            return None


# Singleton instance
_ollama_client: Optional[OllamaClient] = None


def get_ollama_client(
    base_url: str | None = None,
    model: str | None = None,
) -> OllamaClient:
    """Get or create the global Ollama client."""
    global _ollama_client
    
    from backend.core.ai_config import get_ai_config
    config = get_ai_config()
    
    actual_url = base_url or config.ollama_url or "http://localhost:11434"
    actual_model = model or config.local_model or "qwen2.5:7b"
    
    if _ollama_client is None:
        _ollama_client = OllamaClient(base_url=actual_url, model=actual_model)
    else:
        # Update URL and Model if they changed
        _ollama_client.base_url = actual_url
        _ollama_client.model = actual_model
        
    return _ollama_client
