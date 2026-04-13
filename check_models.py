"""List all Gemini models supported by the API key."""
from google import genai

client = genai.Client(api_key="AIzaSyC433Y8fS33ESyU0mYCc0u5ZSTwHUGMeoM")

print("=" * 80)
print("Supported Gemini Models (generateContent)")
print("=" * 80)

for m in client.models.list():
    actions = getattr(m, "supported_actions", []) or getattr(m, "supported_generation_methods", [])
    if "generateContent" in str(actions):
        inp = getattr(m, "input_token_limit", "?")
        out = getattr(m, "output_token_limit", "?")
        print(f"  {m.name:50s} | in={inp:>10} | out={out:>10}")
