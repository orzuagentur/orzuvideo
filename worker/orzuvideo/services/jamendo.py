from __future__ import annotations

import random
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import httpx

from orzuvideo.config import ASSETS_DIR, settings

JAMENDO_TRACKS_URL = "https://api.jamendo.com/v3.0/tracks/"

# Map free-text moods to Jamendo tags that actually return results
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
    # Prefer strong motivational / epic instrumental beds
    strategies = [
        {"tags": "epic", "vocalinstrumental": "instrumental", "order": "popularity_total"},
        {"tags": "energetic", "vocalinstrumental": "instrumental", "order": "popularity_total"},
        {"tags": tags[0], "vocalinstrumental": "instrumental", "order": "popularity_total"},
        {"tags": "+".join(tags[:2]), "order": "popularity_total"},
        {"fuzzytags": "motivational", "order": "popularity_month"},
        {"tags": "soundtrack", "vocalinstrumental": "instrumental", "order": "popularity_total"},
        {"order": "popularity_total", "vocalinstrumental": "instrumental"},
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


def _pick_playable(tracks: list[dict], exclude_ids: set[str] | None = None) -> dict | None:
    ban = exclude_ids or set()
    preferred = [
        t
        for t in tracks
        if t.get("audiodownload_allowed")
        and (t.get("audiodownload") or t.get("audio"))
        and str(t.get("id")) not in ban
    ]
    pool = preferred or [
        t
        for t in tracks
        if (t.get("audio") or t.get("audiodownload")) and str(t.get("id")) not in ban
    ]
    if not pool:
        pool = [t for t in tracks if t.get("audio") or t.get("audiodownload")]
    if not pool:
        return None
    return random.choice(pool)


def _cache_music(src: Path) -> None:
    """Keep last good bed so future jobs never go silent."""
    cache_dir = ASSETS_DIR / "music"
    cache_dir.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copy2(src, cache_dir / "last_bed.mp3")
    except Exception as exc:
        print(f"Music cache write failed: {exc}")


def _local_fallback(dest: Path) -> JamendoTrack | None:
    local = ASSETS_DIR / "music"
    if not local.exists():
        return None
    files = sorted(
        [*(local.glob("*.mp3")), *(local.glob("*.wav"))],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not files:
        return None
    pick_file = files[0] if files[0].name == "last_bed.mp3" else random.choice(files)
    dest.write_bytes(pick_file.read_bytes())
    print(f"Using local music fallback: {pick_file.name} ({dest.stat().st_size} bytes)")
    return JamendoTrack(
        id="local",
        name=pick_file.stem,
        artist="Local asset",
        shareurl="",
        download_url="",
        path=dest,
    )


def _generate_ambient_bed(dest: Path, seconds: float = 90.0) -> JamendoTrack:
    """Last-resort instrumental bed via ffmpeg (never ship silent Shorts)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    fade = max(1.0, seconds - 1.5)
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=130:sample_rate=44100:duration={seconds:.1f}",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=196:sample_rate=44100:duration={seconds:.1f}",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=262:sample_rate=44100:duration={seconds:.1f}",
        "-filter_complex",
        (
            "[0:a][1:a][2:a]amix=inputs=3:duration=longest,"
            "lowpass=f=900,highpass=f=70,volume=0.55,"
            f"afade=t=in:st=0:d=1,afade=t=out:st={fade:.1f}:d=1.5"
        ),
        "-t",
        f"{seconds:.1f}",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        str(dest),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not dest.exists() or dest.stat().st_size < 5_000:
        raise RuntimeError(f"Failed to generate ambient music bed:\n{proc.stderr[-1500:]}")
    print(f"Generated ambient music bed ({dest.stat().st_size} bytes)")
    _cache_music(dest)
    return JamendoTrack(
        id="generated",
        name="Ambient bed",
        artist="OrzuVideo",
        shareurl="",
        download_url="",
        path=dest,
    )


def download_background_music(
    mood: str,
    dest: Path,
    *,
    exclude_ids: set[str] | None = None,
) -> JamendoTrack:
    """
    Always return a playable music bed.
    Prefer strong motivational/epic instrumental; skip previously used track IDs.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    client_id = (settings.jamendo_client_id or "").strip()
    print(f"Music: JAMENDO_CLIENT_ID={'set' if client_id else 'MISSING'}")

    forced = (mood or "").strip() or "motivational epic"
    if "motivat" not in forced.lower() and "epic" not in forced.lower():
        forced = f"motivational epic {forced}"

    if client_id:
        try:
            tracks = search_tracks(forced)
            if not tracks:
                tracks = search_tracks("epic energetic soundtrack")
            pick = _pick_playable(tracks, exclude_ids)
            if pick:
                url = pick.get("audiodownload") or pick.get("audio")
                if not url:
                    raise RuntimeError("Jamendo track has no audio URL")
                with httpx.Client(timeout=120.0, follow_redirects=True) as client:
                    r = client.get(url)
                    r.raise_for_status()
                    if len(r.content) < 10_000:
                        raise RuntimeError("Jamendo audio file too small")
                    dest.write_bytes(r.content)
                print(
                    f"Jamendo music: {pick.get('name')} by {pick.get('artist_name')} "
                    f"({len(r.content)} bytes) id={pick.get('id')}"
                )
                track = JamendoTrack(
                    id=str(pick.get("id")),
                    name=str(pick.get("name") or "Unknown"),
                    artist=str(pick.get("artist_name") or "Unknown"),
                    shareurl=str(pick.get("shareurl") or ""),
                    download_url=str(url),
                    path=dest,
                )
                _cache_music(dest)
                return track
            print("Jamendo: no playable tracks found")
        except Exception as exc:
            print(f"Jamendo music fetch failed, trying fallbacks: {exc}")

    local = _local_fallback(dest)
    if local:
        return local

    return _generate_ambient_bed(dest)


def attribution_line(track: JamendoTrack | None) -> str:
    if not track or track.id in ("local", "generated"):
        return ""
    link = f" {track.shareurl}" if track.shareurl else ""
    return f'Music: "{track.name}" by {track.artist} via Jamendo{link}'
