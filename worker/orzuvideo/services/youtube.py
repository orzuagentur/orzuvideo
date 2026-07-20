from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from orzuvideo.config import settings

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]


def _credentials_from_profile(profile: dict[str, Any]) -> Credentials:
    if not profile.get("youtube_refresh_token"):
        raise RuntimeError("YouTube is not connected for this user")

    creds = Credentials(
        token=profile.get("youtube_access_token"),
        refresh_token=profile["youtube_refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.youtube_client_id,
        client_secret=settings.youtube_client_secret,
        scopes=SCOPES,
    )
    if not creds.valid and creds.refresh_token:
        creds.refresh(Request())
    return creds


def youtube_client(profile: dict[str, Any]):
    creds = _credentials_from_profile(profile)
    return build("youtube", "v3", credentials=creds), creds


def list_video_comment_threads(
    profile: dict[str, Any],
    video_id: str,
    *,
    max_results: int = 50,
) -> list[dict[str, Any]]:
    """Newest top-level comments for a video (owner auth)."""
    youtube, _ = youtube_client(profile)
    response = (
        youtube.commentThreads()
        .list(
            part="snippet,replies",
            videoId=video_id,
            maxResults=min(100, max(1, max_results)),
            order="time",
            textFormat="plainText",
        )
        .execute()
    )
    out: list[dict[str, Any]] = []
    for item in response.get("items") or []:
        top = (item.get("snippet") or {}).get("topLevelComment") or {}
        sn = top.get("snippet") or {}
        comment_id = top.get("id") or ""
        if not comment_id:
            continue
        author_channel = ""
        ac = sn.get("authorChannelId")
        if isinstance(ac, dict):
            author_channel = str(ac.get("value") or "")
        replies_raw = ((item.get("replies") or {}).get("comments")) or []
        reply_texts = []
        for r in replies_raw:
            rsn = (r or {}).get("snippet") or {}
            ac_r = rsn.get("authorChannelId")
            reply_texts.append(
                {
                    "id": r.get("id"),
                    "author": rsn.get("authorDisplayName") or "",
                    "text": rsn.get("textDisplay") or "",
                    "author_channel_id": (
                        (ac_r or {}).get("value") if isinstance(ac_r, dict) else ""
                    ),
                }
            )
        out.append(
            {
                "thread_id": item.get("id"),
                "comment_id": comment_id,
                "author": sn.get("authorDisplayName") or "Viewer",
                "author_channel_id": author_channel,
                "text": sn.get("textDisplay") or "",
                "published_at": sn.get("publishedAt"),
                "like_count": int(sn.get("likeCount") or 0),
                "reply_count": int(
                    (item.get("snippet") or {}).get("totalReplyCount") or 0
                ),
                "replies": reply_texts,
            }
        )
    return out


def reply_to_comment(
    profile: dict[str, Any],
    *,
    parent_comment_id: str,
    text: str,
) -> dict[str, str]:
    """Post a reply under a top-level comment. Returns reply id + refreshed access token."""
    youtube, creds = youtube_client(profile)
    body = {
        "snippet": {
            "parentId": parent_comment_id,
            "textOriginal": text[:9000],
        }
    }
    response = youtube.comments().insert(part="snippet", body=body).execute()
    return {
        "reply_id": response.get("id") or "",
        "access_token": creds.token or "",
    }


def upload_short(
    profile: dict[str, Any],
    video_path: Path,
    *,
    title: str,
    description: str,
    tags: list[str],
    thumbnail_path: Path | None = None,
) -> dict[str, str]:
    youtube, creds = youtube_client(profile)

    body = {
        "snippet": {
            "title": title[:100],
            "description": description[:5000],
            "tags": tags[:15],
            "categoryId": "22",
        },
        "status": {
            "privacyStatus": "public",
            "selfDeclaredMadeForKids": False,
        },
    }

    media = MediaFileUpload(str(video_path), mimetype="video/mp4", resumable=True)
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
    response = None
    while response is None:
        status, response = request.next_chunk()
        _ = status

    video_id = response["id"]

    if thumbnail_path and thumbnail_path.exists():
        try:
            thumb_media = MediaFileUpload(
                str(thumbnail_path), mimetype="image/jpeg", resumable=False
            )
            youtube.thumbnails().set(videoId=video_id, media_body=thumb_media).execute()
            print(f"YouTube custom thumbnail set for {video_id}")
        except Exception as exc:
            # Non-fatal: channel may lack custom-thumb privilege
            print(f"YouTube thumbnail set skipped: {exc}")

    return {
        "youtube_video_id": video_id,
        "youtube_url": f"https://youtube.com/shorts/{video_id}",
        "access_token": creds.token or "",
    }


def dump_token_debug(creds: Credentials, path: Path) -> None:
    path.write_text(
        json.dumps({"token": creds.token, "expiry": str(creds.expiry)}, indent=2),
        encoding="utf-8",
    )
