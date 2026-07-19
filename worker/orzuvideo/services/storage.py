from __future__ import annotations

from pathlib import Path

from supabase import Client


PREVIEW_BUCKET = "short-previews"
AUDIO_BUCKET = "ig-audio"


def ensure_bucket(sb: Client, name: str, *, public: bool = True) -> None:
    try:
        existing = {b.get("name") for b in (sb.storage.list_buckets() or [])}
        if name not in existing:
            sb.storage.create_bucket(
                name,
                options={"public": public, "file_size_limit": 104857600},
            )
            print(f"Created storage bucket: {name}")
    except Exception as exc:
        print(f"Bucket ensure skipped ({name}): {exc}")


def upload_public_file(
    sb: Client,
    *,
    bucket: str,
    key: str,
    path: Path,
    content_type: str,
) -> str:
    ensure_bucket(sb, bucket, public=True)
    data = path.read_bytes()
    try:
        sb.storage.from_(bucket).remove([key])
    except Exception:
        pass
    sb.storage.from_(bucket).upload(
        key,
        data,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return sb.storage.from_(bucket).get_public_url(key)


def upload_preview(sb: Client, *, user_id: str, job_id: str, video_path: Path) -> str:
    """Upload finished Short/Reel to public storage and return a public URL."""
    return upload_public_file(
        sb,
        bucket=PREVIEW_BUCKET,
        key=f"{user_id}/{job_id}.mp4",
        path=video_path,
        content_type="video/mp4",
    )


def upload_audio(sb: Client, *, user_id: str, job_id: str, audio_path: Path) -> str:
    """Public audio URL for HeyGen audio_url input."""
    suffix = audio_path.suffix.lower() or ".mp3"
    ctype = "audio/mpeg" if suffix in (".mp3", ".mpga") else "audio/wav"
    return upload_public_file(
        sb,
        bucket=AUDIO_BUCKET,
        key=f"{user_id}/{job_id}{suffix}",
        path=audio_path,
        content_type=ctype,
    )
