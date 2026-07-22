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


def get_training(
    sb: Client,
    user_id: str,
    *,
    youtube_channel_id: str | None = None,
) -> dict[str, Any] | None:
    q = (
        sb.table("ai_training")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_trained", True)
    )
    if youtube_channel_id:
        q = q.eq("youtube_channel_id", youtube_channel_id)
    result = q.limit(1).execute()
    rows = result.data or []
    if rows:
        return rows[0]
    # Legacy fallback: any trained row for user
    if youtube_channel_id:
        fallback = (
            sb.table("ai_training")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_trained", True)
            .limit(1)
            .execute()
        )
        frows = fallback.data or []
        return frows[0] if frows else None
    return None


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


def get_montage_settings(sb: Client, user_id: str) -> dict[str, Any]:
    result = (
        sb.table("montage_settings")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if rows:
        return rows[0]
    return {
        "clip_count": 5,
        "music_mood": "motivational epic",
        "music_volume_hook": 0.88,
        "music_volume_body": 0.58,
        "voice_volume": 1.05,
        "transitions_enabled": True,
        "motions_enabled": True,
        "punch_first_clip": True,
        "avoid_reuse_days": 60,
    }


def used_media_ids(
    sb: Client,
    user_id: str,
    provider: str,
    *,
    days: int = 60,
    limit: int = 3000,
    all_time: bool = False,
) -> set[str]:
    try:
        result = (
            sb.table("media_usage")
            .select("asset_id, created_at")
            .eq("user_id", user_id)
            .eq("provider", provider)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        print(f"media_usage read skipped: {exc}")
        return set()
    out: set[str] = set()
    if all_time or days >= 3650:
        for row in result.data or []:
            if row.get("asset_id"):
                out.add(str(row["asset_id"]))
        return out
    cutoff = datetime.now(timezone.utc).timestamp() - days * 86400
    for row in result.data or []:
        try:
            created = row.get("created_at") or ""
            ts = datetime.fromisoformat(str(created).replace("Z", "+00:00")).timestamp()
            if ts >= cutoff:
                out.add(str(row["asset_id"]))
        except Exception:
            out.add(str(row["asset_id"]))
    return out


def record_media_usage(
    sb: Client,
    *,
    user_id: str,
    provider: str,
    asset_id: str,
    job_id: str | None = None,
    title: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    try:
        sb.table("media_usage").upsert(
            {
                "user_id": user_id,
                "provider": provider,
                "asset_id": str(asset_id),
                "job_id": job_id,
                "title": title,
                "meta": meta or {},
            },
            on_conflict="user_id,provider,asset_id",
        ).execute()
    except Exception as exc:
        print(f"media_usage write skipped: {exc}")


def recent_video_topics(sb: Client, user_id: str, *, limit: int = 12) -> list[str]:
    """Titles/hooks from recent jobs so GPT avoids repeats."""
    topics: list[str] = []
    try:
        jobs = (
            sb.table("video_jobs")
            .select("title, script_text, metadata")
            .eq("user_id", user_id)
            .in_("status", ["ready", "published", "uploading", "editing"])
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        for row in jobs.data or []:
            if row.get("title"):
                topics.append(str(row["title"]))
            meta = row.get("metadata") or {}
            if isinstance(meta, dict) and meta.get("hook"):
                topics.append(str(meta["hook"]))
        used = (
            sb.table("media_usage")
            .select("title, asset_id")
            .eq("user_id", user_id)
            .eq("provider", "topic")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        for row in used.data or []:
            if row.get("title"):
                topics.append(str(row["title"]))
            elif row.get("asset_id"):
                topics.append(str(row["asset_id"]))
    except Exception as exc:
        print(f"recent topics skipped: {exc}")
    # unique preserve order
    seen: set[str] = set()
    out: list[str] = []
    for t in topics:
        key = t.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(t.strip())
    return out[:20]
