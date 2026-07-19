from __future__ import annotations

import random
import re
from dataclasses import dataclass
from pathlib import Path

import httpx

from orzuvideo.config import settings

JAMENDO_TRACKS_URL = "https://api.jamendo.com/v3.0/tracks/"


@dataclass
class JamendoTrack:
    id: str
    name: str
    artist: str
    shareurl: str
    download_url: str
    path: Path | None = None


def _mood_to_tags(mood: str) -> str:
    """Map free-text mood to Jamendo fuzzy tags."""
    cleaned = re.sub(r"[^a-zA-Z0-9\s+_-]", " ", mood or "").strip().lower()
    words = [w for w in re.split(r"[\s+_]+", cleaned) if w]
    if not words:
        words = ["cinematic", "motivational"]
    # Jamendo fuzzytags are space/plus separated
    return "+".join(words[:6])


def search_tracks(mood: str, limit: int = 12) -> list[dict]:
    if not settings.jamendo_client_id:
        raise RuntimeError("JAMENDO_CLIENT_ID is required for background music")

    params = {
        "client_id": settings.jamendo_client_id,
        "format": "json",
        "limit": str(limit),
        "fuzzytags": _mood_to_tags(mood),
        "vocalinstrumental": "instrumental",
        "include": "musicinfo",
        "audioformat": "mp32",
        "audiodlformat": "mp32",
        "order": "popularity_total",
    }

    with httpx.Client(timeout=60.0) as client:
        resp = client.get(JAMENDO_TRACKS_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    headers = data.get("headers") or {}
    if headers.get("status") not in ("success", "Success", None) and headers.get("code") not in (
        0,
        "0",
        None,
    ):
        # Jamendo uses headers.code == 0 for OK
        if str(headers.get("code", "0")) != "0":
            raise RuntimeError(f"Jamendo search failed: {headers}")

    return data.get("results") or []


def _pick_downloadable(tracks: list[dict]) -> dict | None:
    downloadable = [
        t
        for t in tracks
        if t.get("audiodownload_allowed") and (t.get("audiodownload") or t.get("audio"))
    ]
    if not downloadable:
        return None
    return random.choice(downloadable)


def download_background_music(mood: str, dest: Path) -> JamendoTrack | None:
    """
    Download an instrumental royalty-free bed from Jamendo matching mood.
    Falls back to local assets/music if API unavailable or no tracks.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)

    # Prefer Jamendo when configured
    if settings.jamendo_client_id:
        try:
            tracks = search_tracks(mood)
            # Retry with broader tags if empty
            if not tracks:
                tracks = search_tracks("cinematic motivational epic")
            pick = _pick_downloadable(tracks)
            if pick:
                url = pick.get("audiodownload") or pick.get("audio")
                with httpx.Client(timeout=120.0, follow_redirects=True) as client:
                    r = client.get(url)
                    r.raise_for_status()
                    dest.write_bytes(r.content)
                return JamendoTrack(
                    id=str(pick.get("id")),
                    name=str(pick.get("name") or "Unknown"),
                    artist=str(pick.get("artist_name") or "Unknown"),
                    shareurl=str(pick.get("shareurl") or ""),
                    download_url=str(url),
                    path=dest,
                )
        except Exception as exc:
            print(f"Jamendo music fetch failed, trying local fallback: {exc}")

    # Local fallback
    local = Path(__file__).resolve().parents[2] / "assets" / "music"
    if local.exists():
        files = list(local.glob("*.mp3")) + list(local.glob("*.wav"))
        if files:
            pick_file = random.choice(files)
            dest.write_bytes(pick_file.read_bytes())
            return JamendoTrack(
                id="local",
                name=pick_file.stem,
                artist="Local asset",
                shareurl="",
                download_url="",
                path=dest,
            )

    return None


def attribution_line(track: JamendoTrack | None) -> str:
    if not track or track.id == "local":
        return ""
    link = f" {track.shareurl}" if track.shareurl else ""
    return f'Music: "{track.name}" by {track.artist} via Jamendo{link}'
