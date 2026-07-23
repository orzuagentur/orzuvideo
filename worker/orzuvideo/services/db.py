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


def requeue_failed_jobs(
    sb: Client,
    *,
    max_attempts: int = 3,
    cooldown_minutes: int = 15,
    limit: int = 10,
) -> int:
    """
    Auto-retry failed jobs (transient errors / worker blips).
    Skips jobs that already hit max attempts or were requeued too often.
    """
    from datetime import timedelta

    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=cooldown_minutes)).isoformat()
    try:
        result = (
            sb.table("video_jobs")
            .select("id,attempt_count,metadata,error_message,updated_at")
            .eq("status", "failed")
            .lt("attempt_count", max_attempts)
            .lte("updated_at", cutoff)
            .order("updated_at")
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        print(f"[RETRY] list failed jobs error: {exc}")
        return 0

    n = 0
    for job in result.data or []:
        meta = job.get("metadata") or {}
        if not isinstance(meta, dict):
            meta = {}
        auto_retries = int(meta.get("auto_retries") or 0)
        if auto_retries >= 2:
            continue
        err = str(job.get("error_message") or "").lower()
        # Permanent / config errors — do not spin forever
        permanent = (
            "youtube is not connected" in err
            or "unauthorized" in err
            or "no platform music" in err
            or "library empty" in err
            or ("training" in err and "required" in err)
            or "fill required" in err
        )
        if permanent:
            continue
        new_meta = {
            **meta,
            "auto_retries": auto_retries + 1,
            "auto_requeued_at": datetime.now(timezone.utc).isoformat(),
            "previous_error": str(job.get("error_message") or "")[:500],
            "auto_repair": True,
        }
        try:
            updated = (
                sb.table("video_jobs")
                .update(
                    {
                        "status": "queued",
                        "error_message": None,
                        "scheduled_for": datetime.now(timezone.utc).isoformat(),
                        "metadata": new_meta,
                    }
                )
                .eq("id", job["id"])
                .eq("status", "failed")
                .execute()
            )
            if updated.data:
                n += 1
                print(
                    f"[RETRY] requeued failed job {job['id']} "
                    f"(auto_retries={auto_retries + 1})"
                )
        except Exception as exc:
            print(f"[RETRY] requeue {job.get('id')} failed: {exc}")
    return n


def requeue_stuck_jobs(
    sb: Client,
    *,
    stale_minutes: int = 45,
    max_attempts: int = 3,
    limit: int = 5,
) -> int:
    """Return mid-pipeline jobs that haven't progressed (worker crash) to queued."""
    from datetime import timedelta

    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=stale_minutes)).isoformat()
    stuck_statuses = [
        "generating_script",
        "generating_voice",
        "fetching_media",
        "editing",
        "uploading",
    ]
    try:
        result = (
            sb.table("video_jobs")
            .select("id,attempt_count,metadata,status,updated_at")
            .in_("status", stuck_statuses)
            .lt("attempt_count", max_attempts)
            .lte("updated_at", cutoff)
            .order("updated_at")
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        print(f"[RETRY] list stuck jobs error: {exc}")
        return 0

    n = 0
    for job in result.data or []:
        meta = job.get("metadata") or {}
        if not isinstance(meta, dict):
            meta = {}
        stuck_retries = int(meta.get("stuck_retries") or 0)
        if stuck_retries >= 2:
            continue
        new_meta = {
            **meta,
            "stuck_retries": stuck_retries + 1,
            "stuck_requeued_at": datetime.now(timezone.utc).isoformat(),
            "stuck_from_status": job.get("status"),
            "auto_repair": True,
        }
        try:
            updated = (
                sb.table("video_jobs")
                .update(
                    {
                        "status": "queued",
                        "error_message": None,
                        "scheduled_for": datetime.now(timezone.utc).isoformat(),
                        "metadata": new_meta,
                    }
                )
                .eq("id", job["id"])
                .in_("status", stuck_statuses)
                .execute()
            )
            if updated.data:
                n += 1
                print(
                    f"[RETRY] requeued stuck job {job['id']} "
                    f"(from {job.get('status')})"
                )
        except Exception as exc:
            print(f"[RETRY] stuck requeue {job.get('id')} failed: {exc}")
    return n


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
