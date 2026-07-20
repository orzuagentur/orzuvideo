"""Auto-read new YouTube comments and reply using AI Training settings.

Note: YouTube Data API does NOT support liking or hearting comments.
We reply to each new unreplied comment when reply_comments_enabled is on.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from orzuvideo.services import db
from orzuvideo.services.comments import generate_comment_reply
from orzuvideo.services.youtube import list_video_comment_threads, reply_to_comment

# Cap work per loop so video jobs still get CPU time
MAX_USERS_PER_TICK = 3
MAX_VIDEOS_PER_USER = 8
MAX_REPLIES_PER_TICK = 6


def _already_handled(sb, comment_id: str) -> bool:
    row = (
        sb.table("comment_replies")
        .select("id,status")
        .eq("youtube_comment_id", comment_id)
        .limit(1)
        .execute()
    )
    rows = row.data or []
    if not rows:
        return False
    return rows[0].get("status") in ("replied", "skipped")


def _channel_already_replied(
    comment: dict[str, Any],
    own_channel_id: str | None,
) -> bool:
    if not own_channel_id:
        return False
    for r in comment.get("replies") or []:
        if str(r.get("author_channel_id") or "") == str(own_channel_id):
            return True
    return False


def _save_reply_row(
    sb,
    *,
    user_id: str,
    video_id: str,
    comment: dict[str, Any],
    reply_text: str | None,
    status: str,
    error: str | None = None,
) -> None:
    payload: dict[str, Any] = {
        "user_id": user_id,
        "youtube_video_id": video_id,
        "youtube_comment_id": comment["comment_id"],
        "comment_text": (comment.get("text") or "")[:4000],
        "comment_author": (comment.get("author") or "")[:200],
        "reply_text": reply_text,
        "status": status,
        "error_message": (error or "")[:1500] if error else None,
    }
    if status == "replied":
        payload["replied_at"] = datetime.now(timezone.utc).isoformat()

    existing = (
        sb.table("comment_replies")
        .select("id")
        .eq("youtube_comment_id", comment["comment_id"])
        .limit(1)
        .execute()
    )
    rows = existing.data or []
    if rows:
        sb.table("comment_replies").update(payload).eq("id", rows[0]["id"]).execute()
    else:
        sb.table("comment_replies").insert(payload).execute()


def process_comment_replies(*, max_replies: int = MAX_REPLIES_PER_TICK) -> int:
    """Scan recent published videos and AI-reply to new comments. Returns reply count."""
    sb = db.get_supabase()
    replied = 0

    trainings = (
        sb.table("ai_training")
        .select("*")
        .eq("reply_comments_enabled", True)
        .eq("is_trained", True)
        .limit(40)
        .execute()
    )
    rows = trainings.data or []
    if not rows:
        return 0

    # Round-robin-ish: process a few users each tick
    for training in rows[:MAX_USERS_PER_TICK]:
        if replied >= max_replies:
            break

        user_id = training["user_id"]
        channel_id = training.get("youtube_channel_id")
        profile = db.get_profile(sb, user_id)
        if not profile or not profile.get("youtube_connected"):
            continue
        if not profile.get("youtube_refresh_token"):
            continue

        q = (
            sb.table("video_jobs")
            .select("id,youtube_video_id,title,youtube_channel_id")
            .eq("user_id", user_id)
            .eq("status", "published")
            .not_.is_("youtube_video_id", "null")
            .order("completed_at", desc=True)
            .limit(MAX_VIDEOS_PER_USER)
        )
        if channel_id:
            q = q.eq("youtube_channel_id", channel_id)
        jobs = q.execute().data or []

        for job in jobs:
            if replied >= max_replies:
                break
            video_id = job.get("youtube_video_id")
            if not video_id:
                continue

            try:
                comments = list_video_comment_threads(
                    profile, str(video_id), max_results=40
                )
            except Exception as exc:
                print(f"[comments] list failed video={video_id}: {exc}")
                continue

            own_id = str(
                channel_id
                or job.get("youtube_channel_id")
                or profile.get("youtube_channel_id")
                or ""
            )

            for comment in comments:
                if replied >= max_replies:
                    break

                cid = comment.get("comment_id")
                text = (comment.get("text") or "").strip()
                if not cid or not text:
                    continue

                # Don't reply to ourselves
                if own_id and str(comment.get("author_channel_id") or "") == own_id:
                    continue

                if _already_handled(sb, cid):
                    continue
                if _channel_already_replied(comment, own_id or None):
                    _save_reply_row(
                        sb,
                        user_id=user_id,
                        video_id=str(video_id),
                        comment=comment,
                        reply_text=None,
                        status="skipped",
                        error="Already has channel reply",
                    )
                    continue

                try:
                    reply_text = generate_comment_reply(
                        user_id=user_id,
                        training=training,
                        comment_text=text,
                        comment_author=comment.get("author"),
                        job_id=job.get("id"),
                    )
                    yt = reply_to_comment(
                        profile,
                        parent_comment_id=cid,
                        text=reply_text,
                    )
                    if yt.get("access_token"):
                        sb.table("profiles").update(
                            {"youtube_access_token": yt["access_token"]}
                        ).eq("id", user_id).execute()

                    _save_reply_row(
                        sb,
                        user_id=user_id,
                        video_id=str(video_id),
                        comment=comment,
                        reply_text=reply_text,
                        status="replied",
                    )
                    replied += 1
                    print(
                        f"[comments] replied video={video_id} "
                        f"comment={cid[:12]}… user={user_id[:8]}"
                    )
                except Exception as exc:
                    _save_reply_row(
                        sb,
                        user_id=user_id,
                        video_id=str(video_id),
                        comment=comment,
                        reply_text=None,
                        status="failed",
                        error=str(exc),
                    )
                    print(f"[comments] reply failed {cid}: {exc}")

    return replied
