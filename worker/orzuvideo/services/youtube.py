from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from orzuvideo.config import settings

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


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


def upload_short(
    profile: dict[str, Any],
    video_path: Path,
    *,
    title: str,
    description: str,
    tags: list[str],
) -> dict[str, str]:
    creds = _credentials_from_profile(profile)
    youtube = build("youtube", "v3", credentials=creds)

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
