from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from orzuvideo.config import settings
from orzuvideo.services.usage import estimate_openai_cost, log_usage


SYSTEM_PROMPT = """You are an elite YouTube scriptwriter and creative director.
Write a {content_kind} that STRICTLY follows the user's AI Training settings below.
Rules:
- Spoken duration target: {duration} seconds (about {word_count} words).
- LANGUAGE CODE: {language}
  HARD RULE: write hook, script, title, description, tags, CTA wording ENTIRELY in this language.
  If any training field (CTA, hook style, style notes) is in another language, TRANSLATE it into {language}.
  Never leave English CTA/hook/title when language is not "en".
- Format: {video_format}{video_style_line}
- Aspect / framing: {aspect_hint}
- CRITICAL OPENING: the first few seconds MUST grab attention.
  The "hook" field must be a punchy pattern interrupt in {language}.
  The spoken script MUST start with that hook.
- After the hook: {pacing_hint}
- Use ONLY the training fields provided. Do NOT invent niche/style/tone/content-type
  that the user did not set. Do NOT default to motivational/discipline content
  unless niche/style explicitly says so.
- Return STRICT JSON only, no markdown.
JSON schema:
{{
  "hook": "attention-grabbing opening line",
  "script": "full spoken narration STARTING with the hook",
  "title": "YouTube title under 70 chars",
  "description": "YouTube description with hashtags",
  "tags": ["tag1", "tag2"],
  "pexels_queries": ["query1", "query2", "query3", "query4", "query5"],
  "subtitle_emphasis": ["WORD1", "WORD2"]
}}
"""

SYSTEM_PROMPT_AUTO = """You are an elite YouTube scriptwriter and creative director.
Write a {content_kind} that STRICTLY follows the user's AI Training settings below.
Rules:
- Choose the ideal spoken duration yourself between {min_duration} and {max_duration} seconds based on the topic
  (simple idea → shorter; richer story → longer). Do NOT force a fixed length.
- Put your chosen length in "duration_seconds" (integer {min_duration}–{max_duration}).
- Aim for about 2.4 words per second of speech.
- LANGUAGE CODE: {language}
  HARD RULE: write hook, script, title, description, tags, CTA wording ENTIRELY in this language.
  If any training field (CTA, hook style, style notes) is in another language, TRANSLATE it into {language}.
  Never leave English CTA/hook/title when language is not "en".
- Format: {video_format}{video_style_line}
- Aspect / framing: {aspect_hint}
- CRITICAL OPENING: the first few seconds MUST grab attention.
  The "hook" field must be a punchy pattern interrupt in {language}.
  The spoken script MUST start with that hook.
- After the hook: {pacing_hint}
- Use ONLY the training fields provided. Do NOT invent niche/style/tone/content-type
  that the user did not set. Do NOT default to motivational/discipline content
  unless niche/style explicitly says so.
- Return STRICT JSON only, no markdown.
JSON schema:
{{
  "duration_seconds": {default_duration},
  "hook": "attention-grabbing opening line",
  "script": "full spoken narration STARTING with the hook",
  "title": "YouTube title under 70 chars",
  "description": "YouTube description with hashtags",
  "tags": ["tag1", "tag2"],
  "pexels_queries": ["query1", "query2", "query3", "query4", "query5"],
  "subtitle_emphasis": ["WORD1", "WORD2"]
}}
"""


def _format_profile(video_format: str) -> dict[str, Any]:
    """Map AI Training format → aspect, duration bounds, writing style hints."""
    fmt = (video_format or "shorts").strip().lower()
    if fmt in ("video", "long", "longform", "youtube_video"):
        return {
            "content_kind": "horizontal YouTube video (16:9, long-form)",
            "aspect": "16:9",
            "min_duration": 90,
            "max_duration": 600,
            "default_duration": 180,
            "aspect_hint": "Landscape 16:9 — cinematic B-roll, not vertical Shorts.",
            "pacing_hint": (
                "Develop a clear structure (intro → points/story → payoff). "
                "Use fuller sentences; still keep energy and clarity."
            ),
            "is_short": False,
            "default_tags": ["youtube"],
            "hashtag_suffix": "",
        }
    if fmt in ("simple", "simple_video"):
        return {
            "content_kind": "simple horizontal YouTube video (16:9)",
            "aspect": "16:9",
            "min_duration": 60,
            "max_duration": 300,
            "default_duration": 120,
            "aspect_hint": "Landscape 16:9 — clean, simple edit suitable for YouTube.",
            "pacing_hint": (
                "Keep structure simple: hook, 2–4 clear points, soft close. "
                "Easy to follow; no overcomplicated storytelling."
            ),
            "is_short": False,
            "default_tags": ["youtube"],
            "hashtag_suffix": "",
        }
    # shorts + legacy mixer / reel-style values
    return {
        "content_kind": "vertical YouTube Short (9:16)",
        "aspect": "9:16",
        "min_duration": 15,
        "max_duration": 60,
        "default_duration": 45,
        "aspect_hint": "Vertical 9:16 Shorts — mobile-first, scroll-stopping.",
        "pacing_hint": "Use short punchy sentences. No fluff.",
        "is_short": True,
        "default_tags": ["shorts"],
        "hashtag_suffix": "\n\n#Shorts",
    }

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


def _filled(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _training_lines(training: dict[str, Any]) -> str:
    """Build prompt lines only from non-empty training fields."""
    mapping = [
        ("Niche", "niche"),
        ("Content type", "content_type"),
        ("Tone", "tone"),
        ("Target audience", "target_audience"),
        ("Hook style", "hook_style"),
        ("CTA (translate into language if needed)", "cta"),
        ("Brand rules", "brand_rules"),
        ("Brand / style instructions", "style_prompt"),
        ("Default Pexels vibe", "pexels_query"),
        ("Music mood", "music_mood"),
    ]
    lines: list[str] = []
    for label, key in mapping:
        val = _filled(training.get(key))
        if not val:
            continue
        if key == "style_prompt":
            lines.append(f'{label}:\n"""{val}"""')
        else:
            lines.append(f"{label}: {val}")
    return "\n".join(lines) if lines else "Niche: (follow style_prompt only)"


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

    # Creativity allows longer personal videos (up to 5 minutes).
    creat_min, creat_max = 15, 300
    if duration_auto or not duration_seconds:
        duration_rule = (
            f"- Choose ideal spoken duration yourself between {creat_min} and {creat_max} seconds "
            "based on the prompt complexity (shorts ~30–60s, stories/explainers up to a few minutes). "
            "Put it in duration_seconds."
        )
        target_note = f"Pick the best duration ({creat_min}–{creat_max}s) for this idea."
    else:
        dur = max(creat_min, min(creat_max, int(duration_seconds)))
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
        or prompt_l.startswith(title_l)
        or title_l.startswith(prompt_l[:40])
    ):
        title = (data.get("hook") or "New video")[:60]

    language = (data.get("language") or "en").strip().lower()[:8] or "en"
    result: dict[str, Any] = {
        "hook": data.get("hook") or script.split(".")[0],
        "script": script,
        "title": title[:90],
        "description": data.get("description") or script[:180],
        "tags": data.get("tags") or ["shorts"],
        "pexels_queries": data.get("pexels_queries")
        or ["cinematic b-roll"],
        "subtitle_emphasis": data.get("subtitle_emphasis") or [],
        "language": language,
        "music_mood": data.get("music_mood"),
    }
    if data.get("duration_seconds") is not None:
        try:
            result["duration_seconds"] = max(
                creat_min, min(creat_max, int(data["duration_seconds"]))
            )
        except (TypeError, ValueError):
            pass
    return result


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
    video_format = _filled(training.get("video_format")) or "shorts"
    profile = _format_profile(video_format)
    min_d = int(profile["min_duration"])
    max_d = int(profile["max_duration"])
    raw_duration = int(training.get("duration_seconds") or profile["default_duration"])
    duration = max(min_d, min(max_d, raw_duration))
    word_count = max(40, int(duration * 2.4))
    language = _filled(training.get("language")) or "en"
    video_style = _filled(training.get("video_style"))
    video_style_line = f" / style: {video_style}" if video_style else ""

    brief_block = ""
    if user_brief and user_brief.strip():
        kind = "Short" if profile["is_short"] else "video"
        brief_block = f"""
USER TOPIC / IDEA FOR THIS VIDEO (topic only — NOT style instructions):
\"\"\"{user_brief.strip()}\"\"\"
Use this ONLY for the subject / angle of this one {kind}.
Do NOT treat it as instructions to change niche, content type, tone, format, or style.
Those always come from AI Training fields above.
"""

    avoid_block = ""
    if avoid_topics:
        listed = "\n".join(f"- {t}" for t in avoid_topics[:15])
        avoid_block = f"""
DO NOT reuse these recent titles/hooks/topics (pick a fresh angle):
{listed}
"""

    cta = _filled(training.get("cta"))
    cta_line = (
        f"End with this CTA, spoken in {language} (translate if the CTA text is English): {cta}"
        if cta
        else f"Optional soft CTA in {language} at the end — invent one only if it fits."
    )

    user_prompt = f"""
AI TRAINING (source of truth — empty fields were omitted on purpose):
{_training_lines(training)}

Language code (mandatory for all spoken/written output): {language}
{cta_line}
{brief_block}
{avoid_block}
Write one unique YouTube script for format "{video_format}".
The opening must feel bold and unforgettable in {language}.
Also return 5 varied pexels_queries (English stock-search phrases) for B-roll montage.
"""

    prompt_kwargs = {
        "language": language,
        "video_format": video_format,
        "video_style_line": video_style_line,
        "content_kind": profile["content_kind"],
        "aspect_hint": profile["aspect_hint"],
        "pacing_hint": profile["pacing_hint"],
        "min_duration": min_d,
        "max_duration": max_d,
        "default_duration": profile["default_duration"],
        "duration": duration,
        "word_count": word_count,
    }

    if duration_auto:
        system_content = SYSTEM_PROMPT_AUTO.format(**prompt_kwargs)
    else:
        system_content = SYSTEM_PROMPT.format(**prompt_kwargs)

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
            chosen_duration = max(min_d, min(max_d, int(data["duration_seconds"])))
        except (TypeError, ValueError):
            chosen_duration = None

    pexels_fallback = _filled(training.get("pexels_query")) or "cinematic b-roll"
    default_title = "Short" if profile["is_short"] else "Video"
    desc = data.get("description") or f"{script}{profile['hashtag_suffix']}"
    result: dict[str, Any] = {
        "hook": data.get("hook") or script.split(".")[0],
        "script": script,
        "title": (data.get("title") or default_title)[:90],
        "description": desc,
        "tags": data.get("tags") or list(profile["default_tags"]),
        "pexels_queries": data.get("pexels_queries") or [pexels_fallback],
        "subtitle_emphasis": data.get("subtitle_emphasis") or [],
        "aspect_ratio": profile["aspect"],
        "is_short": profile["is_short"],
    }
    if chosen_duration is not None:
        result["duration_seconds"] = chosen_duration
    return result
