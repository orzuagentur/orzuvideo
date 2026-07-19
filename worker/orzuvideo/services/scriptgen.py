from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from orzuvideo.config import settings
from orzuvideo.services.usage import estimate_openai_cost, log_usage


SYSTEM_PROMPT = """You are an elite YouTube Shorts scriptwriter and creative director.
Write ultra-viral vertical Shorts scripts for motivational / niche content.
Rules:
- Spoken duration target: {duration} seconds (about {word_count} words).
- Language: {language}
- Format: {video_format} / style: {video_style}
- CRITICAL HOOK: the first 3 seconds MUST stop the scroll.
  The "hook" field must be a punchy 4–10 word pattern interrupt (question, shock claim, or challenge).
  The spoken script MUST start with that hook in the first breath (spoken in under 3 seconds).
- After the hook: short punchy sentences. No fluff.
- End with a soft CTA if provided.
- Respect brand rules.
- Return STRICT JSON only, no markdown.
JSON schema:
{{
  "hook": "4-10 word scroll-stopper for first 3 seconds",
  "script": "full spoken narration STARTING with the hook",
  "title": "YouTube Shorts title under 70 chars",
  "description": "YouTube description with hashtags",
  "tags": ["tag1", "tag2"],
  "pexels_queries": ["query1", "query2", "query3", "query4", "query5"],
  "subtitle_emphasis": ["WORD1", "WORD2"]
}}
"""


def generate_script(
    training: dict[str, Any],
    *,
    user_id: str | None = None,
    job_id: str | None = None,
    user_brief: str | None = None,
) -> dict[str, Any]:
    client = OpenAI(api_key=settings.openai_api_key)
    duration = int(training.get("duration_seconds") or 45)
    word_count = max(40, int(duration * 2.4))

    brief_block = ""
    if user_brief and user_brief.strip():
        brief_block = f"""
USER BRIEF FOR THIS VIDEO (highest priority — build the Short around this):
\"\"\"{user_brief.strip()}\"\"\"
Follow this brief closely for topic, angle, and message. Still respect brand rules and training style.
"""

    user_prompt = f"""
Niche: {training.get('niche')}
Content type: {training.get('content_type')}
Tone: {training.get('tone')}
Target audience: {training.get('target_audience') or 'general'}
Hook style: {training.get('hook_style')}
CTA: {training.get('cta')}
Brand rules: {training.get('brand_rules') or 'none'}
Brand / style instructions (user trained AI):
\"\"\"{training.get('style_prompt')}\"\"\"
Default Pexels vibe: {training.get('pexels_query')}
Music mood: {training.get('music_mood')}
{brief_block}
Write one unique Shorts script. Never repeat previous clichés word-for-word.
The opening 3 seconds must feel like a cold open ad — bold, confrontational, unforgettable.
Also return 5 varied pexels_queries (different angles/scenes) for cinematic B-roll montage.
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
                    video_format=training.get("video_format") or "shorts",
                    video_style=training.get("video_style") or "cinematic_mixer",
                ),
            },
            {"role": "user", "content": user_prompt.strip()},
        ],
    )

    if user_id and response.usage:
        cost = estimate_openai_cost(
            response.usage.prompt_tokens or 0,
            response.usage.completion_tokens or 0,
        )
        log_usage(
            user_id=user_id,
            job_id=job_id,
            provider="openai",
            kind="script_generation",
            units=(response.usage.prompt_tokens or 0)
            + (response.usage.completion_tokens or 0),
            unit_label="tokens",
            cost_usd=cost,
            meta={
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "model": settings.openai_model,
            },
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
