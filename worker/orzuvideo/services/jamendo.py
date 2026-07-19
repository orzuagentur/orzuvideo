from __future__ import annotations

import random
import re
from dataclasses import dataclass
from pathlib import Path

import httpx

from orzuvideo.config import settings

JAMENDO_TRACKS_URL = "https://api.jamendo.com/v3.0/tracks/"

# Map free-text moods → Jamendo tags that actually return results
MOOD_TAG_MAP: dict[str, list[str]] = {
    "cinematic": ["soundtrack", "ambient", "orchestral"],
    "motivational": ["epic", "upbeat", "energetic"],
    "epic": ["epic", "soundtrack", "orchestral"],
    "dark": ["dark", "ambient", "electronic"],
    "calm": ["ambient", "chill", "relaxing"],
    "energetic": ["energetic", "upbeat", "electronic"],
    "corporate": ["corporate", "upbeat", "acoustic"],
    "sad": ["sad", "piano", "ambient"],
    "happy": ["happy", "upbeat", "pop"],
    "trap": ["hiphop", "electronic", "urban"],
    "lofi": ["chill", "lofi", "ambient"],
}


@dataclass
class JamendoTrack:
    id: str
    name: str
    artist: str
    shareurl: str
    download_url: str
    path: Path | None = None


def _mood_tags(mood: str) -> list[str]:
    cleaned = re.sub(r"[^a-zA-Z0-9\s_-]", " ", mood or "").strip().lower()
    words = [w for w in re.split(r"[\s_-]+", cleaned) if w]
    tags: list[str] = []
    for w in words:
        tags.extend(MOOD_TAG_MAP.get(w, [w]))
    # Dedupe preserve order
    seen: set[str] = set()
    out: list[str] = []
    for t in tags:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out[:4] or ["soundtrack", "epic", "ambient"]


def _fetch_tracks(params: dict) -> list[dict]:
    if not settings.jamendo_client_id:
        raise RuntimeError("JAMENDO_CLIENT_ID is required for background music")

    base = {
        "client_id": settings.jamendo_client_id,
        "format": "json",
        "limit": "15",
        "audioformat": "mp32",
        "audiodlformat": "mp32",
        "include": "musicinfo",
    }
    base.update(params)
    with httpx.Client(timeout=60.0) as client:
        resp = client.get(JAMENDO_TRACKS_URL, params=base)
        resp.raise_for_status()
        data = resp.json()

    headers = data.get("headers") or {}
    if str(headers.get("code", "0")) not in ("0",):
        raise RuntimeError(f"Jamendo error: {headers}")
    return data.get("results") or []


def search_tracks(mood: str) -> list[dict]:
    """Try several Jamendo query strategies until tracks are found."""
    tags = _mood_tags(mood)
    strategies = [
        {"tags": tags[0], "vocalinstrumental": "instrumental", "order": "popularity_total"},
        {"tags": "+".join(tags[:2]), "order": "popularity_total"},
        {"fuzzytags": tags[0], "order": "popularity_month"},
        {"order": "popularity_total", "vocalinstrumental": "instrumental"},
        {"order": "popularity_total"},
    ]

    for params in strategies:
        try:
            results = _fetch_tracks(params)
        except Exception as exc:
            print(f"Jamendo strategy failed {params}: {exc}")
            continue
        if results:
            print(f"Jamendo ok via {params} -> {len(results)} tracks")
            return results
    return []


def _pick_playable(tracks: list[dict]) -> dict | None:
    # Prefer downloadable instrumentals; fall back to stream URL
    preferred = [
        t
        for t in tracks
        if t.get("audiodownload_allowed") and (t.get("audiodownload") or t.get("audio"))
    ]
    pool = preferred or [t for t in tracks if t.get("audio") or t.get("audiodownload")]
    if not pool:
        return None
    return random.choice(pool)


def download_background_music(mood: str, dest: Path) -> JamendoTrack | None:
    """
    Download royalty-free bed from Jamendo.
    Falls back to local assets/music if API unavailable.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)

    if settings.jamendo_client_id:
        try:
            tracks = search_tracks(mood or "cinematic motivational")
            pick = _pick_playable(tracks)
            if pick:
                url = pick.get("audiodownload") or pick.get("audio")
                with httpx.Client(timeout=120.0, follow_redirects=True) as client:
                    r = client.get(url)
                    r.raise_for_status()
                    if len(r.content) < 10_000:
                        raise RuntimeError("Jamendo audio file too small")
                    dest.write_bytes(r.content)
                print(
                    f"Jamendo music: {pick.get('name')} by {pick.get('artist_name')} "
                    f"({len(r.content)} bytes)"
                )
                return JamendoTrack(
                    id=str(pick.get("id")),
                    name=str(pick.get("name") or "Unknown"),
                    artist=str(pick.get("artist_name") or "Unknown"),
                    shareurl=str(pick.get("shareurl") or ""),
                    download_url=str(url),
                    path=dest,
                )
            print("Jamendo: no playable tracks found")
        except Exception as exc:
            print(f"Jamendo music fetch failed, trying local fallback: {exc}")

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
