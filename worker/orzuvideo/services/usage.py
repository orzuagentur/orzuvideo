from __future__ import annotations

from typing import Any

from orzuvideo.services.db import get_supabase


# Approximate public pricing (USD) — update as needed
OPENAI_GPT4O_MINI_IN = 0.15 / 1_000_000
OPENAI_GPT4O_MINI_OUT = 0.60 / 1_000_000
ELEVENLABS_PER_CHAR = 0.00003  # rough estimate for tracking


def log_usage(
    *,
    user_id: str,
    provider: str,
    kind: str,
    units: float,
    unit_label: str,
    cost_usd: float,
    job_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    sb = get_supabase()
    sb.table("usage_events").insert(
        {
            "user_id": user_id,
            "job_id": job_id,
            "provider": provider,
            "kind": kind,
            "units": units,
            "unit_label": unit_label,
            "cost_usd": round(cost_usd, 6),
            "meta": meta or {},
        }
    ).execute()


def estimate_openai_cost(prompt_tokens: int, completion_tokens: int) -> float:
    return prompt_tokens * OPENAI_GPT4O_MINI_IN + completion_tokens * OPENAI_GPT4O_MINI_OUT


def estimate_elevenlabs_cost(chars: int) -> float:
    return chars * ELEVENLABS_PER_CHAR
