from __future__ import annotations

import random
from pathlib import Path

import httpx

from orzuvideo.config import settings


def search_videos(query: str, per_page: int = 12, page: int = 1) -> list[dict]:
    if not settings.pexels_api_key:
        raise RuntimeError("PEXELS_API_KEY is required")

    headers = {"Authorization": settings.pexels_api_key}
    params = {
        "query": query,
        "orientation": "portrait",
        "size": "medium",
        "per_page": per_page,
        "page": page,
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
    *,
    exclude_ids: set[str] | set[int] | None = None,
) -> tuple[list[Path], list[str]]:
    """
    Download unique Pexels clips, skipping IDs already used on prior videos.
    Returns (paths, used_asset_ids).
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    clips: list[Path] = []
    used_ids: list[str] = []
    seen_ids: set[str] = {str(x) for x in (exclude_ids or set())}

    shuffled = list(queries)
    random.shuffle(shuffled)
    # Extra generic queries if we keep hitting used IDs
    extras = [
        "cinematic city night",
        "athlete training grit",
        "sunrise mountain hike",
        "ocean waves drone",
        "neon street walking",
        "coffee shop creator",
        "storm clouds timelapse",
        "desert road driving",
    ]
    search_list = shuffled + [e for e in extras if e not in shuffled]

    for query in search_list:
        if len(clips) >= count:
            break
        for page in (1, 2, 3):
            if len(clips) >= count:
                break
            try:
                videos = search_videos(query, per_page=30, page=page)
            except Exception as exc:
                print(f"Pexels search failed ({query} p{page}): {exc}")
                continue
            if not videos:
                break
            random.shuffle(videos)
            for video in videos:
                vid = str(video.get("id") or "")
                if not vid or vid in seen_ids:
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
                used_ids.append(vid)
                print(f"Pexels clip {vid} for query={query!r} page={page}")
                if len(clips) >= count:
                    break

    if not clips and exclude_ids:
        # Library exhausted for this user — soft reuse, still shuffled
        print(
            f"[PEXELS] no unused clips left (excluded={len(exclude_ids)}) — soft reuse"
        )
        return download_stock_clips(queries, dest_dir, count=count, exclude_ids=None)

    if not clips:
        raise RuntimeError(f"No fresh Pexels clips for queries: {queries}")
    return clips, used_ids
