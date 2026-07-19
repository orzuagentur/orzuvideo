from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import Client, create_client

from orzuvideo.config import settings


def get_supabase() -> Client:
    if not settings.supabase_url or not settings.supabase_service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return create_client(settings.supabase_url, settings.supabase_service_key)


def claim_next_job(sb: Client) -> dict[str, Any] | None:
    """Atomically pick the oldest queued job and mark it generating_script."""
    now = datetime.now(timezone.utc).isoformat()
    result = (
        sb.table("video_jobs")
        .select("*")
        .eq("status", "queued")
        .lte("scheduled_for", now)
        .order("scheduled_for")
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return None

    job = rows[0]
    updated = (
        sb.table("video_jobs")
        .update(
            {
                "status": "generating_script",
                "attempt_count": (job.get("attempt_count") or 0) + 1,
            }
        )
        .eq("id", job["id"])
        .eq("status", "queued")
        .execute()
    )
    if not updated.data:
        return None
    return updated.data[0]


def beat_presence(sb: Client, *, working: bool = False) -> None:
    """Tell the dashboard the Python worker is alive."""
    import socket

    try:
        sb.table("worker_presence").upsert(
            {
                "id": "main",
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
                "hostname": socket.gethostname(),
                "meta": {
                    "poll_interval_sec": settings.poll_interval_sec,
                    "working": working,
                },
            }
        ).execute()
    except Exception as exc:
        print(f"worker_presence beat failed (run migration 004?): {exc}")


def update_job(sb: Client, job_id: str, **fields: Any) -> None:
    sb.table("video_jobs").update(fields).eq("id", job_id).execute()


def get_training(sb: Client, user_id: str) -> dict[str, Any] | None:
    result = (
        sb.table("ai_training")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_trained", True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def get_profile(sb: Client, user_id: str) -> dict[str, Any] | None:
    result = sb.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    rows = result.data or []
    return rows[0] if rows else None


def record_published(
    sb: Client,
    *,
    user_id: str,
    job_id: str,
    youtube_video_id: str,
    youtube_url: str,
    title: str,
    script_text: str,
) -> None:
    sb.table("published_videos").insert(
        {
            "user_id": user_id,
            "job_id": job_id,
            "youtube_video_id": youtube_video_id,
            "youtube_url": youtube_url,
            "title": title,
            "script_text": script_text,
        }
    ).execute()
