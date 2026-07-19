from __future__ import annotations

import random
from pathlib import Path

import httpx

from orzuvideo.config import settings


def search_videos(query: str, per_page: int = 8) -> list[dict]:
    if not settings.pexels_api_key:
        raise RuntimeError("PEXELS_API_KEY is required")

    headers = {"Authorization": settings.pexels_api_key}
    params = {
        "query": query,
        "orientation": "portrait",
        "size": "medium",
        "per_page": per_page,
    }
    with httpx.Client(timeout=60.0) as client:
        resp = client.get(
            "https://api.pexels.com/videos/search",
            headers=headers,
            params=params,
        )
        resp.raise_for_status()
        return resp.json().get("videos") or []


def _best_file(video: dict) -> str | None:
    files = video.get("video_files") or []
    # Prefer HD portrait-ish files under ~1080p for speed
    ranked = sorted(
        files,
        key=lambda f: (
            0 if (f.get("width") or 0) >= 720 else 1,
            abs((f.get("height") or 0) - 1920),
            abs((f.get("width") or 0) - 1080),
        ),
    )
    for f in ranked:
        link = f.get("link")
        if link:
            return link
    return None


def download_stock_clips(
    queries: list[str],
    dest_dir: Path,
    count: int = 3,
) -> list[Path]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    clips: list[Path] = []
    seen_ids: set[int] = set()

    shuffled = list(queries)
    random.shuffle(shuffled)

    for query in shuffled:
        if len(clips) >= count:
            break
        videos = search_videos(query)
        random.shuffle(videos)
        for video in videos:
            vid = video.get("id")
            if vid in seen_ids:
                continue
            link = _best_file(video)
            if not link:
                continue
            seen_ids.add(vid)
            path = dest_dir / f"pexels_{vid}.mp4"
            with httpx.Client(timeout=120.0, follow_redirects=True) as client:
                r = client.get(link)
                r.raise_for_status()
                path.write_bytes(r.content)
            clips.append(path)
            if len(clips) >= count:
                break

    if not clips:
        raise RuntimeError(f"No Pexels clips found for queries: {queries}")
    return clips


def download_music(mood: str, dest: Path) -> Path | None:
    """
    Optional: use Pexels-free approach via local royalty-free bed,
    or skip if no music asset. Returns path if available.
    """
    local = Path(__file__).resolve().parents[2] / "assets" / "music"
    if local.exists():
        files = list(local.glob("*.mp3")) + list(local.glob("*.wav"))
        if files:
            pick = random.choice(files)
            dest.write_bytes(pick.read_bytes())
            return dest
    # Mood unused when no local library — montage still works with voice only
    _ = mood
    return None
