"""Auto-read new YouTube comments and reply using AI Training settings.

Note: YouTube Data API does NOT support liking or hearting comments.
We reply to each new unreplied comment (top-level and nested viewer replies)
when reply_comments_enabled is on.
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


def _save_reply_row(
    sb,
    *,
    user_id: str,
    video_id: str,
    comment_id: str,
    comment_text: str,
    comment_author: str,
    reply_text: str | None,
    status: str,
    error: str | None = None,
) -> None:
    payload: dict[str, Any] = {
        "user_id": user_id,
        "youtube_video_id": video_id,
        "youtube_comment_id": comment_id,
        "comment_text": (comment_text or "")[:4000],
        "comment_author": (comment_author or "")[:200],
        "reply_text": reply_text,
        "status": status,
        "error_message": (error or "")[:1500] if error else None,
    }
    if status == "replied":
        payload["replied_at"] = datetime.now(timezone.utc).isoformat()

    existing = (
        sb.table("comment_replies")
        .select("id")
        .eq("youtube_comment_id", comment_id)
        .limit(1)
        .execute()
    )
    rows = existing.data or []
    if rows:
        sb.table("comment_replies").update(payload).eq("id", rows[0]["id"]).execute()
    else:
        sb.table("comment_replies").insert(payload).execute()


def _pending_targets(
    thread: dict[str, Any],
    own_channel_id: str | None,
) -> list[dict[str, Any]]:
    """
    Return viewer comments we should AI-reply to.

    - Top-level: if no channel reply exists yet in the thread.
    - Nested viewer replies published after the last channel reply (follow-ups).
    Each target is keyed by its own comment id so follow-ups are not skipped.
    """
    own = str(own_channel_id or "")
    targets: list[dict[str, Any]] = []
    replies = list(thread.get("replies") or [])

    # Chronological: replies without published_at stay at end
    def _key(r: dict[str, Any]) -> str:
        return str(r.get("published_at") or "")

    replies_sorted = sorted(replies, key=_key)

    top_id = str(thread.get("comment_id") or "")
    top_author_ch = str(thread.get("author_channel_id") or "")
    if top_id and top_author_ch != own:
        channel_already = any(
            str(r.get("author_channel_id") or "") == own for r in replies_sorted
        )
        if not channel_already:
            targets.append(
                {
                    "comment_id": top_id,
                    "author": thread.get("author") or "Viewer",
                    "text": thread.get("text") or "",
                    "author_channel_id": top_author_ch,
                }
            )

    last_ours_idx = -1
    for i, r in enumerate(replies_sorted):
        if own and str(r.get("author_channel_id") or "") == own:
            last_ours_idx = i

    for i, r in enumerate(replies_sorted):
        rid = str(r.get("id") or "")
        if not rid:
            continue
        if own and str(r.get("author_channel_id") or "") == own:
            continue
        # Only follow-up viewer messages after our last reply
        if last_ours_idx >= 0 and i <= last_ours_idx:
            continue
        # If we never replied, top-level handles the first message;
        # still reply to extra nested viewer messages that appear before us
        # only when they appear AFTER an initial channel reply (handled above).
        if last_ours_idx < 0:
            continue
        targets.append(
            {
                "comment_id": rid,
                "author": r.get("author") or "Viewer",
                "text": r.get("text") or "",
                "author_channel_id": str(r.get("author_channel_id") or ""),
            }
        )

    return targets


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

            for thread in comments:
                if replied >= max_replies:
                    break

                for target in _pending_targets(thread, own_id or None):
                    if replied >= max_replies:
                        break
                    cid = target.get("comment_id")
                    text = (target.get("text") or "").strip()
                    if not cid or not text:
                        continue
                    if _already_handled(sb, cid):
                        continue

                    try:
                        reply_text = generate_comment_reply(
                            user_id=user_id,
                            training=training,
                            comment_text=text,
                            comment_author=target.get("author"),
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
                            comment_id=cid,
                            comment_text=text,
                            comment_author=str(target.get("author") or ""),
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
                            comment_id=cid,
                            comment_text=text,
                            comment_author=str(target.get("author") or ""),
                            reply_text=None,
                            status="failed",
                            error=str(exc),
                        )
                        print(f"[comments] reply failed {cid}: {exc}")

    return replied
