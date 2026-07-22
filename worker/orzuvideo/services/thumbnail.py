from __future__ import annotations

import subprocess
from pathlib import Path

from orzuvideo.services.storage import (
    StoredObject,
    media_bucket,
    thumb_object_path,
    upload_public_file,
)


def extract_thumbnail(video_path: Path, out_path: Path, *, at_sec: float = 1.2) -> Path:
    """Grab a still frame from the finished Short for cover / YouTube thumb."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    for t in (max(0.3, at_sec), 0.5, 0.1):
        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{t:.2f}",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(out_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode == 0 and out_path.exists() and out_path.stat().st_size > 2_000:
            return out_path
    raise RuntimeError(
        f"Failed to extract thumbnail:\n{(proc.stderr if proc else '')[-1200:]}"
    )


def upload_thumbnail(
    sb=None,
    *,
    user_id: str,
    job_id: str,
    image_path: Path,
) -> StoredObject:
    """Upload cover JPEG to Cloudflare R2."""
    _ = sb
    key = thumb_object_path(user_id, job_id)
    return upload_public_file(
        bucket=media_bucket(),
        key=key,
        path=image_path,
        content_type="image/jpeg",
    )
