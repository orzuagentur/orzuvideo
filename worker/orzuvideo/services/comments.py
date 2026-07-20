from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from orzuvideo.config import settings
from orzuvideo.services.db import get_supabase
from orzuvideo.services.usage import estimate_openai_cost, log_usage


def load_learning_examples(user_id: str, limit: int = 8) -> list[dict[str, Any]]:
    sb = get_supabase()
    result = (
        sb.table("ai_learning_memory")
        .select("input_text, output_text, language, feedback")
        .eq("user_id", user_id)
        .eq("source", "comment_reply")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


def generate_comment_reply(
    *,
    user_id: str,
    training: dict[str, Any],
    comment_text: str,
    comment_author: str | None = None,
    job_id: str | None = None,
) -> str:
    if not training.get("reply_comments_enabled"):
        raise RuntimeError("Comment replies are disabled in AI training")

    examples = []
    if training.get("learning_enabled", True):
        examples = load_learning_examples(user_id)

    example_block = "\n".join(
        [
            f"- Comment: {e.get('input_text')}\n  Reply: {e.get('output_text')}"
            for e in examples
            if e.get("output_text")
        ]
    )

    client = OpenAI(api_key=settings.openai_api_key)
    system = f"""You reply to YouTube comments for a channel.
Reply in the SAME language as the commenter (unless reply_languages is locked).
Style: {training.get('reply_style_prompt') or 'Friendly, brief, on-brand'}
Brand rules: {training.get('brand_rules') or 'none'}
Niche: {training.get('niche') or 'general'}
Keep replies under 280 characters. No hashtag spam. No links unless asked.
"""
    user = f"""Comment author: {comment_author or 'viewer'}
Comment: {comment_text}

Past successful reply examples (learn from these):
{example_block or '(none yet)'}

Return JSON: {{"reply": "...", "language": "xx"}}
"""

    response = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.7,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )

    usage = response.usage
    if usage:
        cost = estimate_openai_cost(usage.prompt_tokens or 0, usage.completion_tokens or 0)
        log_usage(
            user_id=user_id,
            job_id=job_id,
            provider="openai",
            kind="comment_reply",
            units=(usage.prompt_tokens or 0) + (usage.completion_tokens or 0),
            unit_label="tokens",
            cost_usd=cost,
            meta={"prompt_tokens": usage.prompt_tokens, "completion_tokens": usage.completion_tokens},
        )

    data = json.loads(response.choices[0].message.content or "{}")
    reply = (data.get("reply") or "").strip()
    language = data.get("language") or "auto"
    if not reply:
        raise RuntimeError("Empty comment reply")

    if training.get("learning_enabled", True):
        sb = get_supabase()
        sb.table("ai_learning_memory").insert(
            {
                "user_id": user_id,
                "source": "comment_reply",
                "input_text": comment_text,
                "output_text": reply,
                "language": language,
                "feedback": "neutral",
                "meta": {"author": comment_author},
            }
        ).execute()

    return reply
