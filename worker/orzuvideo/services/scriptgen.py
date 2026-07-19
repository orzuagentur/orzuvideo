from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from orzuvideo.config import settings


SYSTEM_PROMPT = """You are an elite YouTube Shorts scriptwriter and creative director.
Write ultra-viral vertical Shorts scripts for motivational / niche content.
Rules:
- Spoken duration target: {duration} seconds (about {word_count} words).
- Language: {language}
- Strong hook in first 2 seconds.
- Short punchy sentences. No fluff.
- End with a soft CTA if provided.
- Return STRICT JSON only, no markdown.
JSON schema:
{{
  "hook": "string",
  "script": "full spoken narration including hook",
  "title": "YouTube Shorts title under 70 chars",
  "description": "YouTube description with hashtags",
  "tags": ["tag1", "tag2"],
  "pexels_queries": ["query1", "query2", "query3"],
  "subtitle_emphasis": ["WORD1", "WORD2"]
}}
"""


def generate_script(training: dict[str, Any]) -> dict[str, Any]:
    client = OpenAI(api_key=settings.openai_api_key)
    duration = int(training.get("duration_seconds") or 45)
    word_count = max(40, int(duration * 2.4))

    user_prompt = f"""
Niche: {training.get('niche')}
Content type: {training.get('content_type')}
Tone: {training.get('tone')}
Target audience: {training.get('target_audience') or 'general'}
Hook style: {training.get('hook_style')}
CTA: {training.get('cta')}
Brand / style instructions (user trained AI once):
\"\"\"{training.get('style_prompt')}\"\"\"
Default Pexels vibe: {training.get('pexels_query')}
Music mood: {training.get('music_mood')}
Write one unique Shorts script. Never repeat previous clichés word-for-word.
"""

    response = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.9,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT.format(
                    duration=duration,
                    word_count=word_count,
                    language=training.get("language") or "en",
                ),
            },
            {"role": "user", "content": user_prompt.strip()},
        ],
    )

    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    script = (data.get("script") or "").strip()
    if not script:
        raise RuntimeError("OpenAI returned empty script")

    return {
        "hook": data.get("hook") or script.split(".")[0],
        "script": script,
        "title": (data.get("title") or "Daily Motivation")[:90],
        "description": data.get("description")
        or f"{script}\n\n#Shorts #Motivation",
        "tags": data.get("tags") or ["shorts", "motivation"],
        "pexels_queries": data.get("pexels_queries")
        or [training.get("pexels_query") or "cinematic man"],
        "subtitle_emphasis": data.get("subtitle_emphasis") or [],
    }
