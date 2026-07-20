from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from supabase import Client


PREVIEW_BUCKET = "short-previews"
AUDIO_BUCKET = "ig-audio"
MAX_PREVIEW_BYTES = 104_857_600  # 100 MB — must match bucket limit


@dataclass(frozen=True)
class StoredObject:
    bucket: str
    path: str
    public_url: str


def preview_object_path(user_id: str, job_id: str) -> str:
    return f"{user_id}/{job_id}.mp4"


def ensure_bucket(
    sb: Client,
    name: str,
    *,
    public: bool = True,
    mime_types: list[str] | None = None,
    file_size_limit: int = MAX_PREVIEW_BYTES,
) -> None:
    """Create bucket if missing. Failures are logged; SQL migration is source of truth."""
    try:
        buckets = sb.storage.list_buckets() or []
        existing = {
            (getattr(b, "name", None) or (b.get("name") if isinstance(b, dict) else None))
            for b in buckets
        }
        if name in existing:
            return
        sb.storage.create_bucket(
            name,
            options={
                "public": public,
                "file_size_limit": file_size_limit,
                "allowed_mime_types": mime_types
                or ["video/mp4", "video/quicktime", "video/webm"],
            },
        )
        print(f"Created storage bucket: {name} (public={public})")
    except Exception as exc:
        print(f"Bucket ensure note ({name}): {exc}")


def _upload_bytes(
    sb: Client,
    *,
    bucket: str,
    key: str,
    data: bytes,
    content_type: str,
) -> None:
    # Remove stale object so upsert quirks cannot leave an old/corrupt file
    try:
        sb.storage.from_(bucket).remove([key])
    except Exception:
        pass

    # supabase-py accepts file_options; upsert as string is required by Storage API
    result = sb.storage.from_(bucket).upload(
        key,
        data,
        file_options={
            "content-type": content_type,
            "upsert": "true",
        },
    )
    # Some client versions return dict with error
    if isinstance(result, dict) and result.get("error"):
        raise RuntimeError(f"Storage upload error: {result['error']}")


def _verify_object(sb: Client, *, bucket: str, key: str) -> None:
    """Confirm the object is readable after upload."""
    try:
        signed = sb.storage.from_(bucket).create_signed_url(key, 60)
    except Exception as exc:
        raise RuntimeError(f"Storage verify failed (signed url): {exc}") from exc

    url = None
    if isinstance(signed, dict):
        url = signed.get("signedURL") or signed.get("signedUrl")
    if not url:
        raise RuntimeError(
            f"Storage verify failed: object not found after upload ({bucket}/{key})"
        )


def upload_public_file(
    sb: Client,
    *,
    bucket: str,
    key: str,
    path: Path,
    content_type: str,
) -> StoredObject:
    if not path.exists():
        raise RuntimeError(f"Local file missing for upload: {path}")
    size = path.stat().st_size
    if size < 512:
        raise RuntimeError(f"Local file too small to be a valid video ({size} bytes): {path}")
    if size > MAX_PREVIEW_BYTES:
        raise RuntimeError(
            f"File exceeds storage limit ({size} > {MAX_PREVIEW_BYTES} bytes): {path}"
        )

    ensure_bucket(
        sb,
        bucket,
        public=True,
        mime_types=(
            ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav"]
            if bucket == AUDIO_BUCKET
            else ["video/mp4", "video/quicktime", "video/webm"]
        ),
        file_size_limit=52_428_800 if bucket == AUDIO_BUCKET else MAX_PREVIEW_BYTES,
    )
    data = path.read_bytes()
    print(f"Uploading {size} bytes → {bucket}/{key}")
    try:
        _upload_bytes(sb, bucket=bucket, key=key, data=data, content_type=content_type)
    except Exception as exc:
        # Retry once (transient network / upsert race)
        print(f"Upload retry after error: {exc}")
        _upload_bytes(sb, bucket=bucket, key=key, data=data, content_type=content_type)

    _verify_object(sb, bucket=bucket, key=key)
    public_url = sb.storage.from_(bucket).get_public_url(key)
    if not public_url or not str(public_url).startswith("http"):
        raise RuntimeError(f"Invalid public URL after upload: {public_url!r}")

    print(f"Storage OK: {bucket}/{key}")
    return StoredObject(bucket=bucket, path=key, public_url=str(public_url))


def upload_preview(
    sb: Client, *, user_id: str, job_id: str, video_path: Path
) -> StoredObject:
    """Upload finished platform video to short-previews and return storage refs."""
    return upload_public_file(
        sb,
        bucket=PREVIEW_BUCKET,
        key=preview_object_path(user_id, job_id),
        path=video_path,
        content_type="video/mp4",
    )


def upload_audio(
    sb: Client, *, user_id: str, job_id: str, audio_path: Path
) -> StoredObject:
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


def storage_meta(obj: StoredObject) -> dict[str, Any]:
    return {
        "storage_bucket": obj.bucket,
        "storage_path": obj.path,
        "preview_uploaded": True,
    }
