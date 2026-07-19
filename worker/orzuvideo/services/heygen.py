"""HeyGen talking-avatar client for Instagram Reels."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import httpx

from orzuvideo.config import settings

API_BASE = "https://api.heygen.com"


def heygen_configured() -> bool:
    return bool((settings.heygen_api_key or "").strip())


def _headers() -> dict[str, str]:
    key = (settings.heygen_api_key or "").strip()
    if not key:
        raise RuntimeError("HEYGEN_API_KEY is missing in worker/.env")
    return {"X-Api-Key": key, "Content-Type": "application/json"}


def create_video_from_audio(
    *,
    avatar_id: str,
    audio_url: str,
    title: str = "OrzuVideo Reel",
    background_color: str = "#0C0D10",
) -> str:
    """Start avatar render; returns HeyGen video_id."""
    aid = (avatar_id or settings.heygen_avatar_id or "").strip()
    if not aid:
        raise RuntimeError("HeyGen avatar_id missing")

    body: dict[str, Any] = {
        "video_inputs": [
            {
                "character": {
                    "type": "avatar",
                    "avatar_id": aid,
                    "avatar_style": "normal",
                },
                "voice": {
                    "type": "audio",
                    "audio_url": audio_url,
                },
                "background": {
                    "type": "color",
                    "value": background_color,
                },
            }
        ],
        "dimension": {"width": 1080, "height": 1920},
        "caption": False,
        "title": title[:80],
    }

    with httpx.Client(timeout=120.0) as client:
        resp = client.post(
            f"{API_BASE}/v2/video/generate",
            headers=_headers(),
            json=body,
        )
        data = resp.json()
        if resp.status_code >= 400:
            raise RuntimeError(f"HeyGen generate failed: {data}")

    video_id = (data.get("data") or {}).get("video_id") or data.get("video_id")
    if not video_id:
        raise RuntimeError(f"HeyGen response missing video_id: {data}")
    print(f"HeyGen job started: {video_id}")
    return str(video_id)


def wait_for_video(video_id: str, *, timeout_sec: float = 900.0) -> dict[str, Any]:
    """Poll until completed/failed. Returns status payload with video_url."""
    started = time.time()
    last: dict[str, Any] = {}
    with httpx.Client(timeout=60.0) as client:
        while time.time() - started < timeout_sec:
            resp = client.get(
                f"{API_BASE}/v1/video_status.get",
                headers=_headers(),
                params={"video_id": video_id},
            )
            payload = resp.json()
            if resp.status_code >= 400:
                raise RuntimeError(f"HeyGen status failed: {payload}")
            last = payload.get("data") or payload
            status = str(last.get("status") or "").lower()
            print(f"HeyGen status={status}")
            if status in ("completed", "done", "success"):
                if not last.get("video_url"):
                    raise RuntimeError(f"HeyGen completed without video_url: {last}")
                return last
            if status in ("failed", "error"):
                raise RuntimeError(
                    f"HeyGen failed: {last.get('error') or last.get('message') or last}"
                )
            time.sleep(8.0)
    raise RuntimeError(f"HeyGen timed out after {timeout_sec}s: {last}")


def download_video(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=300.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    print(f"HeyGen video saved: {dest} ({dest.stat().st_size} bytes)")
    return dest


def render_avatar_reel(
    *,
    avatar_id: str,
    audio_url: str,
    dest: Path,
    title: str = "OrzuVideo Reel",
) -> Path:
    video_id = create_video_from_audio(
        avatar_id=avatar_id,
        audio_url=audio_url,
        title=title,
    )
    data = wait_for_video(video_id)
    return download_video(str(data["video_url"]), dest)
