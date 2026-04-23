"""
Script Analyzer Agent â€” AI-powered dialogue/script analysis.

Takes SRT content and uses Gemini to:
1. Identify characters from dialogue context
2. Assign each dialogue line to a character
3. Suggest poses/actions/emotions per timestamp
"""

from __future__ import annotations
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from ..ai_config import get_ai_config

logger = logging.getLogger(__name__)


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  DATA TYPES
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@dataclass
class CharacterAction:
    """A single action/pose suggestion for a character at a specific time."""
    start_time: float = 0.0
    end_time: float = 0.0
    dialogue: str = ""
    emotion: str = "neutral"
    pose: str = "standing"
    action: str = "idle"
    face_direction: str = "front"
    description: str = ""

    def to_dict(self) -> dict:
        return {
            "start_time": self.start_time,
            "end_time": self.end_time,
            "dialogue": self.dialogue,
            "emotion": self.emotion,
            "pose": self.pose,
            "action": self.action,
            "face_direction": self.face_direction,
            "description": self.description,
        }


@dataclass
class ScriptCharacter:
    """A character identified from the script."""
    id: str = ""
    name: str = ""
    role: str = ""  # narrator, protagonist, antagonist, supporting, etc.
    gender: str = "unknown"
    description: str = ""
    actions: list[CharacterAction] = field(default_factory=list)
    color: str = "#6366f1"  # UI color for this character

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "gender": self.gender,
            "description": self.description,
            "color": self.color,
            "actions": [a.to_dict() for a in self.actions],
        }


@dataclass
class ScriptAnalysisResult:
    """Full analysis result for a script."""
    title: str = ""
    summary: str = ""
    characters: list[ScriptCharacter] = field(default_factory=list)
    scene_description: str = ""
    total_duration: float = 0.0

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "summary": self.summary,
            "characters": [c.to_dict() for c in self.characters],
            "scene_description": self.scene_description,
            "total_duration": self.total_duration,
        }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  SYSTEM PROMPT
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

SCRIPT_ANALYZER_PROMPT = """Báº¡n lÃ  má»™t Ä‘áº¡o diá»…n phim hoáº¡t hÃ¬nh chuyÃªn nghiá»‡p. Nhiá»‡m vá»¥ cá»§a báº¡n lÃ  phÃ¢n tÃ­ch ká»‹ch báº£n (dáº¡ng SRT subtitle) vÃ  xÃ¡c Ä‘á»‹nh:

1. **NhÃ¢n váº­t**: Ai Ä‘ang nÃ³i trong má»—i cÃ¢u thoáº¡i (dá»±a vÃ o ngá»¯ cáº£nh, ná»™i dung, giá»ng Ä‘iá»‡u)
2. **HÃ nh Ä‘á»™ng/TÆ° tháº¿**: Äá» xuáº¥t tÆ° tháº¿, hÃ nh Ä‘á»™ng, biá»ƒu cáº£m cho tá»«ng nhÃ¢n váº­t á»Ÿ tá»«ng Ä‘oáº¡n thá»i gian
3. **Cáº£m xÃºc**: Nháº­n diá»‡n cáº£m xÃºc tá»« ná»™i dung lá»i thoáº¡i

## QUY Táº®C NHáº¬N DIá»†N NHÃ‚N Váº¬T (Cá»°C Ká»² QUAN TRá»ŒNG)

### PHáº¢I TÃCH Tá»ªNG CÃ NHÃ‚N â€” KHÃ”NG Gá»˜P NHÃ“M
- Náº¿u ká»‹ch báº£n nháº¯c "Akatsuki" â†’ PHáº¢I liá»‡t kÃª tá»«ng thÃ nh viÃªn xuáº¥t hiá»‡n (Pain, Itachi, Konan, Deidara...)
- Náº¿u ká»‹ch báº£n nháº¯c "3 anh em" â†’ táº¡o 3 nhÃ¢n váº­t riÃªng (Anh cáº£, Anh hai, Em Ãºt hoáº·c tÃªn cá»¥ thá»ƒ náº¿u cÃ³)
- Náº¿u ká»‹ch báº£n nháº¯c "nhÃ³m báº¡n" â†’ liá»‡t kÃª tá»«ng ngÆ°á»i báº¡n xuáº¥t hiá»‡n
- Má»–I NGÆ¯á»œI NÃ“I lÃ  Má»˜T nhÃ¢n váº­t riÃªng biá»‡t

### CÃCH XÃC Äá»ŠNH NHÃ‚N Váº¬T
- PhÃ¢n tÃ­ch Ná»˜I DUNG cÃ¢u thoáº¡i: ai nÃ³i gÃ¬, xÆ°ng hÃ´ gÃ¬ (tÃ´i/ta/bá»n ta, anh/em/con)
- TÃ¬m MANH Má»I tÃªn: "Naruto nÃ³i...", "Theo lá»i Pain..."
- Äáº¿m Sá» GIá»ŒNG NÃ“I khÃ¡c nhau (giá»ng Ä‘iá»‡u, cÃ¡ch xÆ°ng hÃ´)
- Náº¿u 1 cÃ¢u thoáº¡i cÃ³ nhiá»u ngÆ°á»i nÃ³i â†’ tÃ¡ch thÃ nh actions riÃªng
- Khi nghi ngá» â†’ táº¡o nhÃ¢n váº­t má»›i thay vÃ¬ gá»™p vÃ o nhÃ¢n váº­t cÅ©

### NHÃ‚N Váº¬T KHÃ”NG NÃ“I
- NhÃ¢n váº­t Ä‘Æ°á»£c nháº¯c Ä‘áº¿n trong lá»i thoáº¡i CÅ¨NG lÃ  nhÃ¢n váº­t (táº¡o vá»›i actions "listening"/"idle")
- NhÃ¢n váº­t pháº£n á»©ng (gáº­t Ä‘áº§u, cÆ°á»i...) nhÆ°ng khÃ´ng nÃ³i â†’ váº«n táº¡o riÃªng

### GÃN TÃŠN
- Náº¿u biáº¿t tÃªn nhÃ¢n váº­t â†’ dÃ¹ng tÃªn chÃ­nh xÃ¡c
- Náº¿u khÃ´ng biáº¿t tÃªn â†’ gÃ¡n tÃªn mÃ´ táº£ cá»¥ thá»ƒ: "Cáº­u bÃ© tÃ³c vÃ ng", "CÃ´ gÃ¡i Ã¡o Ä‘á»", "NgÆ°á»i Ä‘Ã n Ã´ng giÃ "
- KHÃ”NG gÃ¡n tÃªn chung chung nhÆ° "NhÃ¢n váº­t 1", "NgÆ°á»i nÃ³i A" trá»« khi hoÃ n toÃ n khÃ´ng cÃ³ manh má»‘i
- "Narrator" CHá»ˆ dÃ¹ng cho pháº§n ká»ƒ chuyá»‡n bÃªn ngoÃ i (ngÆ°á»i dáº«n chuyá»‡n), KHÃ”NG pháº£i nhÃ¢n váº­t nÃ³i thoáº¡i

QUAN TRá»ŒNG:
- File SRT KHÃ”NG cÃ³ tÃªn nhÃ¢n váº­t, báº¡n pháº£i tá»± suy luáº­n tá»« ná»™i dung
- Æ¯U TIÃŠN tÃ¡ch nhiá»u nhÃ¢n váº­t hÆ¡n lÃ  gá»™p â€” sai sá»‘ nhiá»u nhÃ¢n váº­t < sai sá»‘ Ã­t nhÃ¢n váº­t
- Má»—i nhÃ¢n váº­t cáº§n cÃ³ danh sÃ¡ch hÃ nh Ä‘á»™ng theo thá»i gian

Tráº£ vá» JSON Ä‘Ãºng format sau (KHÃ”NG cÃ³ text nÃ o khÃ¡c ngoÃ i JSON):
{
  "title": "TÃªn cáº£nh/táº­p",
  "summary": "TÃ³m táº¯t ngáº¯n ná»™i dung",
  "scene_description": "MÃ´ táº£ bá»‘i cáº£nh, khÃ´ng gian",
  "characters": [
    {
      "id": "char_1",
      "name": "TÃªn nhÃ¢n váº­t Cá»¤ THá»‚ (khÃ´ng dÃ¹ng tÃªn nhÃ³m)",
      "role": "narrator|protagonist|antagonist|supporting",
      "gender": "male|female|unknown",
      "description": "MÃ´ táº£ ngáº¯n vá» nhÃ¢n váº­t, Ä‘áº·c Ä‘iá»ƒm nháº­n dáº¡ng",
      "color": "#hex_color",
      "actions": [
        {
          "start_time": 0.0,
          "end_time": 2.5,
          "dialogue": "CÃ¢u thoáº¡i gá»‘c",
          "emotion": "happy|sad|angry|surprised|neutral|scared|serious|excited",
          "pose": "standing|sitting|walking|running|pointing|arms_crossed|hands_on_hips",
          "action": "talking|listening|thinking|laughing|crying|nodding|waving|idle",
          "face_direction": "front|left|right|back",
          "description": "MÃ´ táº£ hÃ nh Ä‘á»™ng báº±ng tiáº¿ng Viá»‡t"
        }
      ]
    }
  ]
}

Quy táº¯c cho actions:
- CÃ¡c actions pháº£i cover toÃ n bá»™ timeline tá»« Ä‘áº§u Ä‘áº¿n cuá»‘i
- Khi nhÃ¢n váº­t khÃ´ng nÃ³i, váº«n gÃ¡n action "listening" hoáº·c "idle"
- Má»—i nhÃ¢n váº­t cÃ³ thá»ƒ cÃ³ nhiá»u actions liÃªn tiáº¿p
- emotion vÃ  pose pháº£i Ä‘á»•i theo ná»™i dung thoáº¡i
- DÃ¹ng mÃ u khÃ¡c nhau cho má»—i nhÃ¢n váº­t (color)
"""


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  MAIN FUNCTION
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async def analyze_script(srt_content: str, model: str | None = None) -> ScriptAnalysisResult:
    """Analyze SRT script using Gemini AI."""
    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        logger.error(f"google-genai package not installed: {e}")
        raise ValueError(f"google-genai package not installed: {e}")

    config = get_ai_config()
    api_key = config.api_key
    if not api_key:
        raise ValueError("No API key configured. Add a key via /api/ai/keys/add first.")

    model_name = model or config.model or "gemini-2.0-flash"
    logger.info(f"Analyzing script with model: {model_name}")

    client = genai.Client(api_key=api_key)
    prompt = f"{SCRIPT_ANALYZER_PROMPT}\n\n--- SRT CONTENT ---\n{srt_content}\n--- END ---"

    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.4,
        )
    )
    raw_text = response.text.strip()

    # Parse JSON from response
    result = _parse_analysis(raw_text, srt_content)
    return result


def _parse_analysis(raw_text: str, srt_content: str) -> ScriptAnalysisResult:
    """Parse AI response into ScriptAnalysisResult."""
    # Extract JSON from markdown code blocks if present
    text = raw_text
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {e}\nRaw: {raw_text[:500]}")
        raise ValueError(f"AI returned invalid JSON: {e}")

    # Build result
    result = ScriptAnalysisResult(
        title=data.get("title", "Untitled"),
        summary=data.get("summary", ""),
        scene_description=data.get("scene_description", ""),
    )

    # Parse characters
    colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"]
    for i, char_data in enumerate(data.get("characters", [])):
        char = ScriptCharacter(
            id=char_data.get("id", f"char_{i+1}"),
            name=char_data.get("name", f"NhÃ¢n váº­t {i+1}"),
            role=char_data.get("role", "supporting"),
            gender=char_data.get("gender", "unknown"),
            description=char_data.get("description", ""),
            color=char_data.get("color", colors[i % len(colors)]),
        )

        for act_data in char_data.get("actions", []):
            action = CharacterAction(
                start_time=float(act_data.get("start_time", 0)),
                end_time=float(act_data.get("end_time", 0)),
                dialogue=act_data.get("dialogue", ""),
                emotion=act_data.get("emotion", "neutral"),
                pose=act_data.get("pose", "standing"),
                action=act_data.get("action", "idle"),
                face_direction=act_data.get("face_direction", "front"),
                description=act_data.get("description", ""),
            )
            char.actions.append(action)
            if action.end_time > result.total_duration:
                result.total_duration = action.end_time

        result.characters.append(char)

    return result


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  AUTO-ACTING SCRIPT ANALYZER (Task 4.1)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

AVAILABLE_POSES = [
    "ç«™ç«‹", "æ‰“æ‹›å‘¼", "åç€", "é€ƒè·‘", "ç–‘æƒ‘", "æ‰‹æŒ‡å‘å‰", "ä»‹ç»", "ä¸¾æ‰‹", 
    "ä¸¾èµ·æ‹³å¤´", "å‡ºæ‹³", "æŠ±èƒ¸", "å‰è…°", "æ‘Šå¼€æ‰‹", "æ‚å˜´", "æ‘¸æ‘¸å¤´", "ç¥ˆç¥·", 
    "æ‹±æ‰‹", "æŽ¥ç”µè¯", "è¯·è¿›", "å·ç¬‘", "æŠ±å¤´", "å‹¾æ‰‹æŒ‡", "åå§¿æ€è€ƒ", "æŒ‡è´£"
]

AVAILABLE_FACES = [
    "å¾®ç¬‘", "å¤§ç¬‘", "è¯´è¯", "å¤§å¼", "éš¾è¿‡", "å®³æ€•", "æƒŠè®¶", "æ— è¡¨æƒ…", 
    "å®³ç¾ž", "è‡ªä¿¡", "ç–‘æƒ‘", "å†·æ¼ ", "æ„ŸåŠ¨", "å°´å°¬", "å´‡æ‹œ", "æ‰“å“ˆæ¬ ", 
    "æµæ³ª", "éœ‡æƒŠ", "ç¬‘å˜»å˜»", "çš±çœ‰"
]

AVAILABLE_MOVEMENTS = [
    "enter_left", "enter_right", "exit_left", "exit_right", 
    "walk_to_center", "step_forward", "step_back", "idle"
]

class ScriptAnalyzerAgent:
    @staticmethod
    async def analyze_async(script_lines: list[dict[str, str]], timeout: float = 40.0) -> list[dict[str, str]]:
        """Async version: Ollama first, Gemini fallback."""
        if not script_lines:
            return []

        prompt = ScriptAnalyzerAgent._build_prompt(script_lines)

        # 1. Try Ollama first (free, unlimited)
        try:
            import asyncio as _aio
            from backend.core.ollama_client import get_ollama_client
            ollama = get_ollama_client()
            if await ollama.is_available():
                logger.info("[ScriptAnalyzer] Using local Ollama for analysis...")
                response = await _aio.wait_for(
                    ollama.generate(prompt=prompt, temperature=0.4),
                    timeout=timeout,
                )
                if response:
                    result = ScriptAnalyzerAgent._parse_result(response, script_lines)
                    if result:
                        logger.info(f"[ScriptAnalyzer] Ollama analysis complete: {len(result)} entries")
                        return result
                    logger.warning("[ScriptAnalyzer] Ollama returned invalid result, trying Gemini...")
        except Exception as e:
            logger.debug(f"[ScriptAnalyzer] Ollama attempt failed: {e}")

        # 2. Fallback to Gemini
        return ScriptAnalyzerAgent._gemini_analyze(script_lines, prompt)

    @staticmethod
    def analyze(script_lines: list[dict[str, str]]) -> list[dict[str, str]]:
        """Sync compatibility wrapper. Uses Gemini directly."""
        if not script_lines:
            return []
        prompt = ScriptAnalyzerAgent._build_prompt(script_lines)
        return ScriptAnalyzerAgent._gemini_analyze(script_lines, prompt)

    @staticmethod
    def _build_prompt(script_lines: list[dict[str, str]]) -> str:
        lines = []
        lines.append("Phan tich doan thoai va chi dan san khau (trong ngoac vuong) sau.")
        lines.append("Tra ve JSON form chua mot list cac object:")
        lines.append("[{'target_character':'', 'emotion':'', 'action':'', 'pose_name':'', 'face_name':'', 'movement':''}]")
        lines.append("1. 'target_character': Ten nhan vat dang thuc hien hanh dong hoac noi trong dong do.")
        lines.append("2. Neu co chi bao san khau nhu [di vao], [roi di], [tien toi], hay gan 'movement' tuong ung. Neu khong, gan 'idle'.")
        lines.append(f"Poses: {', '.join(AVAILABLE_POSES)}")
        lines.append(f"Faces: {', '.join(AVAILABLE_FACES)}")
        lines.append(f"Movements: {', '.join(AVAILABLE_MOVEMENTS)}")
        lines.append("")
        lines.append("Thoai:")
        for i, line in enumerate(script_lines):
            char_part = line.get('character', '')
            text_part = line.get('text', '')
            lines.append(f"{i+1} - {char_part}: {text_part}")
        return "\n".join(lines)

    @staticmethod
    def _parse_result(text: str, script_lines: list[dict]) -> list[dict] | None:
        """Parse JSON result from LLM response, validate and sanitize."""
        import re
        clean = text.strip()
        match = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', clean, re.DOTALL)
        if match:
            clean = match.group(1)
        else:
            match = re.search(r'(\[.*\])', clean, re.DOTALL)
            if match:
                clean = match.group(1)
        try:
            result = json.loads(clean)
            if isinstance(result, list) and len(result) == len(script_lines):
                for item in result:
                    if item.get("pose_name") not in AVAILABLE_POSES:
                        item["pose_name"] = "ç«™ç«‹"
                    if item.get("face_name") not in AVAILABLE_FACES:
                        item["face_name"] = "å¾®ç¬‘"
                return result
        except json.JSONDecodeError:
            pass
        return None

    @staticmethod
    def _gemini_analyze(script_lines: list[dict], prompt: str) -> list[dict[str, str]]:
        """Fallback to Gemini Cloud for script analysis."""
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            logger.error(f"google-genai pkg not installed. {e}")
            return []

        config = get_ai_config()
        if not config.has_api_key:
            logger.warning("No API key for ScriptAnalyzer.")
            return []

        max_attempts = config.total_keys if config.total_keys > 0 else 1
        for attempt in range(max_attempts):
            try:
                client = genai.Client(api_key=config.api_key)
                target_model = config.get_rotated_model(attempt)
                logger.info(f"[ScriptAnalyzer] Gemini fallback â€” model: {target_model}")

                response = client.models.generate_content(
                    model=target_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.4,
                        response_mime_type="application/json"
                    )
                )

                result = ScriptAnalyzerAgent._parse_result(response.text, script_lines)
                if result:
                    return result
                return []
            except Exception as e:
                msg = str(e).lower()
                if "429" in msg or "quota" in msg or "resource_exhausted" in msg:
                    if config.rotate_key() and attempt < max_attempts - 1:
                        logger.warning(f"Key rotated due to quota limit: {e}")
                        continue
                logger.error(f"ScriptAnalyzerAgent failed on attempt {attempt}: {e}")
                return []
        return []
