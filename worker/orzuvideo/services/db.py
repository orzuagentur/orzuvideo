from __future__ import annotations

import os
import socket
import uuid
from contextvars import ContextVar, Token
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client, create_client

from orzuvideo.config import settings

WORKER_LEASE_SECONDS = int(os.getenv("WORKER_LEASE_SECONDS", "7200"))
_CURRENT_RUN_ID: ContextVar[str | None] = ContextVar("worker_run_id", default=None)
_CURRENT_WORKER_ID: ContextVar[str | None] = ContextVar("worker_id", default=None)


def get_supabase() -> Client:
    if not settings.supabase_url or not settings.supabase_service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return create_client(settings.supabase_url, settings.supabase_service_key)


def worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}"


def enter_job_context(
    run_id: str | None,
    *,
    worker: str | None = None,
) -> tuple[Token[str | None], Token[str | None]]:
    """Scope updates to the claimed run so stale workers cannot overwrite retries."""
    return (
        _CURRENT_RUN_ID.set(str(run_id) if run_id else None),
        _CURRENT_WORKER_ID.set(worker or worker_id()),
    )


def reset_job_context(tokens: tuple[Token[str | None], Token[str | None]]) -> None:
    run_token, worker_token = tokens
    _CURRENT_RUN_ID.reset(run_token)
    _CURRENT_WORKER_ID.reset(worker_token)


def _lease_expires_at(seconds: int = WORKER_LEASE_SECONDS) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def claim_next_job(sb: Client) -> dict[str, Any] | None:
    """Atomically pick the oldest due queued job."""
    wid = worker_id()
    try:
        result = sb.rpc(
            "claim_next_video_job",
            {
                "p_worker_id": wid,
                "p_lease_seconds": WORKER_LEASE_SECONDS,
            },
        ).execute()
        rows = result.data or []
        if rows:
            return rows[0]
        return None
    except Exception as exc:
        print(f"[QUEUE] RPC claim unavailable, using fallback claim: {exc}")

    return _claim_next_job_fallback(sb, wid)


def _claim_next_job_fallback(sb: Client, wid: str) -> dict[str, Any] | None:
    """Best-effort claim for pre-migration databases."""
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
    run_id = str(uuid.uuid4())
    fields = {
        "status": "generating_script",
        "attempt_count": (job.get("attempt_count") or 0) + 1,
        "worker_run_id": run_id,
        "worker_id": wid,
        "claimed_at": now,
        "lease_expires_at": _lease_expires_at(),
        "error_message": None,
    }
    try:
        updated = (
            sb.table("video_jobs")
            .update(fields)
            .eq("id", job["id"])
            .eq("status", "queued")
            .execute()
        )
    except Exception as exc:
        print(f"[QUEUE] fallback claim without lease columns: {exc}")
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
                        "worker_run_id": None,
                        "worker_id": None,
                        "claimed_at": None,
                        "lease_expires_at": None,
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
    stale_minutes: int = 180,
    max_attempts: int = 3,
    limit: int = 5,
) -> int:
    """Return mid-pipeline jobs that haven't progressed (worker crash) to queued."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=stale_minutes)).isoformat()
    # Do not auto-requeue uploading. A worker crash after YouTube accepted a video
    # but before DB update would otherwise publish duplicates on the next attempt.
    stuck_statuses = [
        "generating_script",
        "generating_voice",
        "fetching_media",
        "editing",
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
                        "worker_run_id": None,
                        "worker_id": None,
                        "claimed_at": None,
                        "lease_expires_at": None,
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

    try:
        sb.table("worker_presence").upsert(
            {
                "id": "main",
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
                "hostname": socket.gethostname(),
                "meta": {
                    "poll_interval_sec": settings.poll_interval_sec,
                    "working": working,
                    "worker_id": worker_id(),
                },
            }
        ).execute()
    except Exception as exc:
        print(f"worker_presence beat failed (run migration 004?): {exc}")


def update_job(sb: Client, job_id: str, **fields: Any) -> None:
    fields = dict(fields)
    run_id = _CURRENT_RUN_ID.get()
    if run_id:
        fields["lease_expires_at"] = _lease_expires_at()
    q = sb.table("video_jobs").update(fields).eq("id", job_id)
    if run_id:
        q = q.eq("worker_run_id", run_id)
    result = q.execute()
    if run_id and not result.data:
        raise RuntimeError(
            f"Lost job lease for {job_id}; another worker/run owns this job now."
        )


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


def get_youtube_profile(
    sb: Client,
    user_id: str,
    *,
    youtube_channel_id: str | None = None,
) -> dict[str, Any] | None:
    """Profile-shaped YouTube auth bag, preferring the channel-scoped token row."""
    profile = get_profile(sb, user_id)
    if youtube_channel_id:
        try:
            result = (
                sb.table("youtube_channels")
                .select("*")
                .eq("user_id", user_id)
                .eq("channel_id", youtube_channel_id)
                .limit(1)
                .execute()
            )
            rows = result.data or []
            if rows:
                row = rows[0]
                return {
                    **(profile or {}),
                    "youtube_connected": True,
                    "youtube_channel_id": row.get("channel_id"),
                    "youtube_channel_title": row.get("title"),
                    "youtube_access_token": row.get("access_token")
                    or (profile or {}).get("youtube_access_token"),
                    "youtube_refresh_token": row.get("refresh_token")
                    or (profile or {}).get("youtube_refresh_token"),
                    "youtube_token_expires_at": row.get("token_expires_at")
                    or (profile or {}).get("youtube_token_expires_at"),
                }
        except Exception as exc:
            print(f"[YOUTUBE] channel auth lookup fallback: {exc}")
    return profile


def update_youtube_access_token(
    sb: Client,
    user_id: str,
    access_token: str,
    *,
    youtube_channel_id: str | None = None,
) -> None:
    if youtube_channel_id:
        try:
            sb.table("youtube_channels").update({"access_token": access_token}).eq(
                "user_id", user_id
            ).eq("channel_id", youtube_channel_id).execute()
        except Exception as exc:
            print(f"[YOUTUBE] channel token update skipped: {exc}")
    try:
        sb.table("profiles").update({"youtube_access_token": access_token}).eq(
            "id", user_id
        ).execute()
    except Exception as exc:
        print(f"[YOUTUBE] profile token update skipped: {exc}")


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
    existing = None
    if job_id:
        try:
            res = (
                sb.table("published_videos")
                .select("id")
                .eq("job_id", job_id)
                .limit(1)
                .execute()
            )
            existing = (res.data or [None])[0]
        except Exception:
            existing = None
    payload = {
        "user_id": user_id,
        "job_id": job_id,
        "youtube_video_id": youtube_video_id,
        "youtube_url": youtube_url,
        "title": title,
        "script_text": script_text,
    }
    if existing:
        sb.table("published_videos").update(payload).eq("id", existing["id"]).execute()
        return
    sb.table("published_videos").insert(
        payload
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
