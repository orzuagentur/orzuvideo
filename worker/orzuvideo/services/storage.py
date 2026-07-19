from __future__ import annotations

from pathlib import Path

from supabase import Client


BUCKET = "short-previews"


def ensure_preview_bucket(sb: Client) -> None:
    try:
        existing = {b.get("name") for b in (sb.storage.list_buckets() or [])}
        if BUCKET not in existing:
            sb.storage.create_bucket(
                BUCKET,
                options={"public": True, "file_size_limit": 104857600},
            )
            print(f"Created storage bucket: {BUCKET}")
    except Exception as exc:
        # Bucket may already exist or lack create permission — upload will surface errors
        print(f"Preview bucket ensure skipped: {exc}")


def upload_preview(sb: Client, *, user_id: str, job_id: str, video_path: Path) -> str:
    """Upload finished Short to public storage and return a public URL."""
    ensure_preview_bucket(sb)
    key = f"{user_id}/{job_id}.mp4"
    data = video_path.read_bytes()
    # Upsert for re-runs
    try:
        sb.storage.from_(BUCKET).remove([key])
    except Exception:
        pass
    sb.storage.from_(BUCKET).upload(
        key,
        data,
        file_options={"content-type": "video/mp4", "upsert": "true"},
    )
    public = sb.storage.from_(BUCKET).get_public_url(key)
    return public
