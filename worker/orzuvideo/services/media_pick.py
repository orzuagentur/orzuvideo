from __future__ import annotations

import random
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from supabase import Client

from orzuvideo.services import db
from orzuvideo.services.storage import download_object, r2_configured


@dataclass
class LibraryTrack:
    id: str
    name: str
    artist: str
    shareurl: str = ""
    download_url: str = ""
    path: Path | None = None
    mood: str = ""
    genre: str = ""


# LibraryTrack is the only music shape — Jamendo removed


def attribution_line(track: LibraryTrack | None) -> str:
    if not track or track.id in ("local", "generated"):
        return ""
    parts = [f'"{track.name}"']
    if track.artist:
        parts.append(f"by {track.artist}")
    return "Music: " + " ".join(parts)


def _parse_music_prefs(training: dict[str, Any] | None) -> dict[str, Any]:
    import json

    prefs = (training or {}).get("music_prefs") or {}
    if isinstance(prefs, str):
        try:
            prefs = json.loads(prefs)
        except Exception:
            prefs = {}
    return prefs if isinstance(prefs, dict) else {}


def exclude_used_media(
    sb: Client,
    user_id: str,
    provider: str,
    *,
    avoid_days: int | None = None,
) -> set[str]:
    _ = avoid_days
    return db.used_media_ids(
        sb,
        user_id,
        provider,
        days=9999,
        limit=3000,
        all_time=True,
    )


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _score_track(
    row: dict[str, Any],
    *,
    mood: str,
    genre_slug: str,
) -> int:
    score = 0
    mood_n = _normalize(mood)
    row_mood = _normalize(str(row.get("mood") or ""))
    g = row.get("music_genres") or {}
    if isinstance(g, list):
        g = g[0] if g else {}
    slug = _normalize(str((g or {}).get("slug") or ""))
    name = _normalize(str((g or {}).get("name") or ""))

    if genre_slug and (slug == genre_slug or name == genre_slug):
        score += 50
    if mood_n and row_mood:
        if mood_n == row_mood:
            score += 40
        elif mood_n in row_mood or row_mood in mood_n:
            score += 25
        else:
            for w in mood_n.split():
                if len(w) > 2 and w in row_mood:
                    score += 8
    return score


def pick_library_track(
    sb: Client,
    user_id: str,
    *,
    preferred_ids: list[str] | None = None,
    exclude_ids: set[str] | None = None,
    music_group: str | None = None,
    script_mood: str | None = None,
    default_mood: str = "cinematic",
) -> dict[str, Any] | None:
    """Pick best unused track from the shared platform R2 music library."""
    _ = user_id  # usage tracking stays per-user; catalog is platform-wide
    ban = {str(x) for x in (exclude_ids or set())}
    preferred = [str(x) for x in (preferred_ids or []) if x and str(x) not in ban]

    for tid in preferred:
        try:
            hit = (
                sb.table("music_tracks")
                .select(
                    "id,title,artist,mood,duration_sec,storage_path,public_url,genre_id,music_genres(name,slug)"
                )
                .eq("is_platform", True)
                .eq("id", tid)
                .limit(1)
                .execute()
            )
            rows = hit.data or []
            if rows:
                return rows[0]
        except Exception as exc:
            print(f"[LIBRARY] preferred id={tid} skip: {exc}")

    try:
        result = (
            sb.table("music_tracks")
            .select(
                "id,title,artist,mood,duration_sec,storage_path,public_url,genre_id,music_genres(name,slug)"
            )
            .eq("is_platform", True)
            .order("created_at", desc=True)
            .limit(200)
            .execute()
        )
    except Exception as exc:
        # Fallback for DBs that have not run migration 021 yet
        print(f"[LIBRARY] platform list failed ({exc}); trying user library")
        try:
            result = (
                sb.table("music_tracks")
                .select(
                    "id,title,artist,mood,duration_sec,storage_path,public_url,genre_id,music_genres(name,slug)"
                )
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(200)
                .execute()
            )
        except Exception as exc2:
            print(f"[LIBRARY] list failed: {exc2}")
            return None

    rows = [r for r in (result.data or []) if str(r.get("id")) not in ban]
    if not rows:
        rows = list(result.data or [])
    if not rows:
        return None

    mood = _normalize(script_mood or default_mood)
    genre_slug = _normalize(music_group or "")
    ranked = sorted(
        rows,
        key=lambda r: _score_track(r, mood=mood, genre_slug=genre_slug),
        reverse=True,
    )
    top = ranked[: max(3, min(8, len(ranked)))]
    best_score = _score_track(top[0], mood=mood, genre_slug=genre_slug)
    pool = [
        r
        for r in top
        if _score_track(r, mood=mood, genre_slug=genre_slug) >= max(0, best_score - 15)
    ]
    return random.choice(pool or top)


def fetch_background_music(
    sb: Client,
    user_id: str,
    job_id: str,
    dest: Path,
    training: dict[str, Any] | None,
    *,
    music_group: str | None = None,
    music_track_id: str | None = None,
    script_mood: str | None = None,
    default_mood: str = "cinematic soundtrack",
) -> tuple[LibraryTrack | None, str | None]:
    """Download a track from the shared platform library (R2) and record usage."""
    training = training or {}
    music_prefs = _parse_music_prefs(training)
    exclude = exclude_used_media(sb, user_id, "library")

    preferred_ids = [
        str(x) for x in (music_prefs.get("selected_track_ids") or []) if x
    ]
    active_gid = str(
        music_group
        or training.get("music_group")
        or music_prefs.get("active_group_id")
        or ""
    ).strip()

    for cg in music_prefs.get("custom_groups") or []:
        if not isinstance(cg, dict):
            continue
        if str(cg.get("id") or "") == active_gid:
            preferred_ids = [
                str(t.get("id") if isinstance(t, dict) else t)
                for t in (cg.get("tracks") or [])
                if t
            ] + preferred_ids
            break

    if music_track_id:
        tid = str(music_track_id).strip()
        if tid:
            preferred_ids = [tid] + [p for p in preferred_ids if p != tid]

    mood = (
        str(script_mood or "").strip()
        or str(training.get("music_mood") or "").strip()
        or default_mood
    )

    print(
        f"[MEDIA] library mood={mood!r} group={active_gid!r} "
        f"exclude={len(exclude)} preferred={len(preferred_ids)}"
    )

    row = pick_library_track(
        sb,
        user_id,
        preferred_ids=preferred_ids,
        exclude_ids=exclude,
        music_group=active_gid,
        script_mood=mood,
        default_mood=default_mood,
    )
    if not row:
        print("[MEDIA] library empty — no background music")
        return None, None

    dest = Path(dest)
    if dest.suffix.lower() not in (".mp3", ".wav", ".m4a", ".aac"):
        dest = dest.with_suffix(".mp3") if dest.suffix else Path(str(dest) + ".mp3")
    dest.parent.mkdir(parents=True, exist_ok=True)

    key = str(row.get("storage_path") or "").strip()
    url = str(row.get("public_url") or "").strip()

    if key and r2_configured():
        try:
            download_object(key, dest)
        except Exception as exc:
            print(f"[MEDIA] R2 music download failed: {exc}")
            key = ""
    if (not key or not dest.exists() or dest.stat().st_size < 1000) and url:
        import httpx

        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            dest.write_bytes(r.content)

    if not dest.exists() or dest.stat().st_size < 1000:
        raise RuntimeError("Library music file missing after download")

    g = row.get("music_genres") or {}
    if isinstance(g, list):
        g = g[0] if g else {}
    track = LibraryTrack(
        id=str(row["id"]),
        name=str(row.get("title") or "Track"),
        artist=str(row.get("artist") or ""),
        shareurl=url,
        download_url=url,
        path=dest,
        mood=str(row.get("mood") or ""),
        genre=str((g or {}).get("name") or ""),
    )
    db.record_media_usage(
        sb,
        user_id=user_id,
        provider="library",
        asset_id=track.id,
        job_id=job_id,
        title=track.name,
        meta={"artist": track.artist, "mood": track.mood, "genre": track.genre},
    )
    attr = attribution_line(track)
    return track, attr


def merge_optional_training(
    sb: Client,
    user_id: str,
    base: dict[str, Any],
) -> dict[str, Any]:
    row = db.get_training(sb, user_id)
    if not row:
        return base
    merged = {**base}
    for key in (
        "voice_id",
        "music_mood",
        "music_group",
        "music_prefs",
        "music_volume",
        "voice_volume",
        "pexels_query",
    ):
        if row.get(key) is not None:
            merged[key] = row[key]
    return merged
