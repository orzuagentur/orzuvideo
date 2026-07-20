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

SYSTEM_PROMPT_AUTO = """You are an elite YouTube Shorts scriptwriter and creative director.
Write ultra-viral vertical Shorts scripts for motivational / niche content.
Rules:
- Choose the ideal spoken duration yourself between 15 and 60 seconds based on the user brief
  (simple idea → shorter; richer story → longer). Do NOT force a fixed length.
- Put your chosen length in "duration_seconds" (integer 15–60).
- Aim for about 2.4 words per second of speech.
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
  "duration_seconds": 30,
  "hook": "4-10 word scroll-stopper for first 3 seconds",
  "script": "full spoken narration STARTING with the hook",
  "title": "YouTube Shorts title under 70 chars",
  "description": "YouTube description with hashtags",
  "tags": ["tag1", "tag2"],
  "pexels_queries": ["query1", "query2", "query3", "query4", "query5"],
  "subtitle_emphasis": ["WORD1", "WORD2"]
}}
"""

# Platform Creativity — independent of YouTube AI Training
CREATIVITY_SYSTEM = """You are a professional short-form video creative director for an in-app video studio.
This is NOT YouTube. There is NO brand training, NO channel niche, NO saved language preference.
The user prompt is the ONLY source of truth for topic, tone, scenes, and language.

Rules:
- Detect the spoken language STRICTLY from the user prompt text itself
  (Cyrillic → usually ru/uz; Latin with Uzbek words → uz; English words → en; etc.).
  Write the ENTIRE narration ("script" and "hook") in that detected language.
  Never default to English unless the prompt itself is English.
- Put the language code in "language" (en, ru, uz, tr, es, de, fr, …).
- Invent a short catchy video TITLE (max 60 characters) in the same language as the script.
  NEVER copy or lightly edit the user prompt as the title.
- "script" is the full spoken narration. Punchy, cinematic, no fluff.
- First 3 seconds must hook attention. Put that opener in "hook" (4–12 words) and start the script with it.
- Choose B-roll search queries in English for stock footage (pexels_queries), matching the visuals described.
- Do NOT invent motivational-coach / gym / discipline themes unless the prompt asks for them.
- Return STRICT JSON only, no markdown.
{duration_rule}
JSON schema:
{{
  "language": "ru",
  "title": "Catchy video name (NOT the prompt)",
  "hook": "short opening line",
  "script": "full spoken narration in the detected language",
  "description": "one short summary sentence",
  "tags": ["tag1", "tag2"],
  "pexels_queries": ["query1", "query2", "query3", "query4", "query5"],
  "subtitle_emphasis": ["WORD1", "WORD2"],
  "music_mood": "short english mood phrase",
  "duration_seconds": 30
}}
"""


def _log_openai_usage(
    *,
    user_id: str | None,
    job_id: str | None,
    response: Any,
    kind: str = "script_generation",
) -> None:
    if not user_id or not response.usage:
        return
    cost = estimate_openai_cost(
        response.usage.prompt_tokens or 0,
        response.usage.completion_tokens or 0,
    )
    log_usage(
        user_id=user_id,
        job_id=job_id,
        provider="openai",
        kind=kind,
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


def generate_creativity_script(
    *,
    user_prompt: str,
    duration_auto: bool = True,
    duration_seconds: int | None = None,
    user_id: str | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    """Create a video package from a free prompt — no AI Training / YouTube settings."""
    prompt = (user_prompt or "").strip()
    if len(prompt) < 8:
        raise RuntimeError("Creativity prompt is too short")

    client = OpenAI(api_key=settings.openai_api_key)

    if duration_auto or not duration_seconds:
        duration_rule = (
            "- Choose ideal spoken duration yourself between 15 and 60 seconds "
            "based on the prompt complexity. Put it in duration_seconds."
        )
        target_note = "Pick the best duration (15–60s) for this idea."
    else:
        dur = max(15, min(60, int(duration_seconds)))
        words = max(40, int(dur * 2.4))
        duration_rule = (
            f"- Spoken duration target: {dur} seconds (about {words} words). "
            f'Set "duration_seconds" to {dur}.'
        )
        target_note = f"Target length: {dur} seconds (~{words} words)."

    system = CREATIVITY_SYSTEM.format(duration_rule=duration_rule)
    user_msg = f"""USER PROMPT (ONLY source of truth — ignore any YouTube/channel training):
\"\"\"{prompt}\"\"\"

{target_note}

Hard requirements:
1) Detect language from THIS prompt only and write script+hook+title in that language.
2) Topic/theme must follow THIS prompt only — do not reuse generic motivational niches.
3) Title = original short name, never the raw prompt.
4) pexels_queries = English stock-search phrases matching the prompt visuals.
"""

    response = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.85,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg.strip()},
        ],
    )
    _log_openai_usage(
        user_id=user_id,
        job_id=job_id,
        response=response,
        kind="creativity_script",
    )

    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    script = (data.get("script") or "").strip()
    if not script:
        raise RuntimeError("OpenAI returned empty creativity script")

    title = (data.get("title") or "").strip()
    prompt_l = prompt.lower().strip()
    title_l = title.lower().strip()
    # Never allow prompt-as-title
    if (
        not title
        or title_l == prompt_l
        or (len(prompt_l) > 20 and title_l == prompt_l[: len(title_l)])
    ):
        hook = (data.get("hook") or "").strip()
        title = (hook[:60] if hook else script.split(".")[0][:60]).strip() or "Untitled video"
    title = title[:70]

    try:
        chosen = max(15, min(60, int(data.get("duration_seconds") or duration_seconds or 30)))
    except (TypeError, ValueError):
        chosen = duration_seconds or 30

    language = (data.get("language") or "en").strip().lower()[:8] or "en"
    music_mood = (data.get("music_mood") or "cinematic emotional").strip()

    return {
        "language": language,
        "hook": data.get("hook") or script.split(".")[0],
        "script": script,
        "title": title,
        "description": data.get("description") or title,
        "tags": data.get("tags") or ["video"],
        "pexels_queries": data.get("pexels_queries")
        or ["cinematic lifestyle", "city lights", "nature aerial"],
        "subtitle_emphasis": data.get("subtitle_emphasis") or [],
        "music_mood": music_mood,
        "duration_seconds": chosen,
    }


def generate_script(
    training: dict[str, Any],
    *,
    user_id: str | None = None,
    job_id: str | None = None,
    user_brief: str | None = None,
    avoid_topics: list[str] | None = None,
) -> dict[str, Any]:
    """YouTube / AI-Training path — uses channel training settings."""
    client = OpenAI(api_key=settings.openai_api_key)
    duration_auto = bool(training.get("duration_auto"))
    duration = int(training.get("duration_seconds") or 45)
    word_count = max(40, int(duration * 2.4))

    brief_block = ""
    if user_brief and user_brief.strip():
        brief_block = f"""
USER BRIEF FOR THIS VIDEO (highest priority — build the Short around this):
\"\"\"{user_brief.strip()}\"\"\"
Follow this brief closely for topic, angle, and message. Still respect brand rules and training style.
"""

    avoid_block = ""
    if avoid_topics:
        listed = "\n".join(f"- {t}" for t in avoid_topics[:15])
        avoid_block = f"""
DO NOT reuse these recent titles/hooks/topics (pick a fresh angle):
{listed}
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
{avoid_block}
Write one unique Shorts script. Never repeat previous clichés word-for-word.
The opening 3 seconds must feel like a cold open ad — bold, confrontational, unforgettable.
Also return 5 varied pexels_queries (different angles/scenes) for cinematic B-roll montage.
"""

    if duration_auto:
        system_content = SYSTEM_PROMPT_AUTO.format(
            language=training.get("language") or "en",
            video_format=training.get("video_format") or "shorts",
            video_style=training.get("video_style") or "cinematic_mixer",
        )
    else:
        system_content = SYSTEM_PROMPT.format(
            duration=duration,
            word_count=word_count,
            language=training.get("language") or "en",
            video_format=training.get("video_format") or "shorts",
            video_style=training.get("video_style") or "cinematic_mixer",
        )

    response = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.9,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_prompt.strip()},
        ],
    )
    _log_openai_usage(user_id=user_id, job_id=job_id, response=response)

    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    script = (data.get("script") or "").strip()
    if not script:
        raise RuntimeError("OpenAI returned empty script")

    chosen_duration: int | None = None
    if duration_auto and data.get("duration_seconds") is not None:
        try:
            chosen_duration = max(15, min(60, int(data["duration_seconds"])))
        except (TypeError, ValueError):
            chosen_duration = None

    result: dict[str, Any] = {
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
    if chosen_duration is not None:
        result["duration_seconds"] = chosen_duration
    return result
