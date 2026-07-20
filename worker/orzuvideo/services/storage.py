from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from supabase import Client


PREVIEW_BUCKET = "short-previews"
# Soft target under common Supabase Free global limit (~50 MB) to avoid 413
STORAGE_SAFE_BYTES = 48_000_000
MAX_PREVIEW_BYTES = 209_715_200  # 200 MB bucket ceiling


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
    """Create bucket if missing, or raise size limit on existing buckets."""
    mime = mime_types or ["video/mp4", "video/quicktime", "video/webm"]
    try:
        buckets = sb.storage.list_buckets() or []
        existing_names = set()
        for b in buckets:
            n = getattr(b, "name", None) or (
                b.get("name") if isinstance(b, dict) else None
            )
            if n:
                existing_names.add(n)

        if name not in existing_names:
            sb.storage.create_bucket(
                name,
                options={
                    "public": public,
                    "file_size_limit": file_size_limit,
                    "allowed_mime_types": mime,
                },
            )
            print(f"Created storage bucket: {name} (public={public})")
            return

        # Existing bucket — bump limit / public so 413 from stale 50MB configs goes away
        try:
            sb.storage.update_bucket(
                name,
                options={
                    "public": public,
                    "file_size_limit": file_size_limit,
                    "allowed_mime_types": mime,
                },
            )
        except Exception as upd_exc:
            print(f"Bucket update note ({name}): {upd_exc}")
    except Exception as exc:
        print(f"Bucket ensure note ({name}): {exc}")


def _run_ffmpeg(args: list[str]) -> None:
    cmd = ["ffmpeg", "-y", *args]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg compress failed:\n{(proc.stderr or '')[-2000:]}")


def shrink_video_for_storage(path: Path, *, max_bytes: int = STORAGE_SAFE_BYTES) -> Path:
    """
    Re-encode oversized MP4 so Supabase Storage upload does not 413.
    Keeps original path if already small enough.
    """
    if not path.exists():
        raise RuntimeError(f"Local file missing for compress: {path}")
    size = path.stat().st_size
    if size <= max_bytes:
        return path

    print(
        f"Video {size / 1_000_000:.1f} MB exceeds storage safe limit "
        f"({max_bytes / 1_000_000:.0f} MB) — compressing for upload"
    )
    out = path.with_name(f"{path.stem}_storage.mp4")

    # Pass 1: balanced Shorts encode
    attempts = [
        ("28", "128k"),
        ("30", "96k"),
        ("32", "64k"),
    ]
    last_err: Exception | None = None
    for crf, audio_br in attempts:
        try:
            _run_ffmpeg(
                [
                    "-i",
                    str(path),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    crf,
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-b:a",
                    audio_br,
                    "-movflags",
                    "+faststart",
                    str(out),
                ]
            )
            if out.exists() and out.stat().st_size <= max_bytes:
                print(
                    f"Compressed {size / 1_000_000:.1f} MB → "
                    f"{out.stat().st_size / 1_000_000:.1f} MB (crf={crf})"
                )
                return out
            if out.exists():
                print(
                    f"Still large after crf={crf}: "
                    f"{out.stat().st_size / 1_000_000:.1f} MB — retry"
                )
        except Exception as exc:
            last_err = exc
            print(f"Compress attempt crf={crf} failed: {exc}")

    if out.exists() and out.stat().st_size < size:
        print(
            f"Using best-effort compress "
            f"{out.stat().st_size / 1_000_000:.1f} MB (may still hit limit)"
        )
        return out
    if last_err:
        raise RuntimeError(f"Could not compress video for storage: {last_err}") from last_err
    raise RuntimeError(
        f"Video too large for storage ({size} bytes) and compress produced no smaller file"
    )


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

    upload_path = path
    if bucket == PREVIEW_BUCKET and content_type.startswith("video/"):
        upload_path = shrink_video_for_storage(path)

    size = upload_path.stat().st_size
    min_bytes = 800 if content_type.startswith("image/") else 512
    if size < min_bytes:
        raise RuntimeError(
            f"Local file too small ({size} bytes): {upload_path}"
        )
    if size > MAX_PREVIEW_BYTES:
        raise RuntimeError(
            f"File exceeds storage limit ({size} > {MAX_PREVIEW_BYTES} bytes): {upload_path}"
        )

    ensure_bucket(
        sb,
        bucket,
        public=True,
        mime_types=["video/mp4", "video/quicktime", "video/webm"],
        file_size_limit=MAX_PREVIEW_BYTES,
    )
    data = upload_path.read_bytes()
    print(f"Uploading {size} bytes → {bucket}/{key}")
    try:
        _upload_bytes(sb, bucket=bucket, key=key, data=data, content_type=content_type)
    except Exception as exc:
        msg = str(exc)
        # One more aggressive compress + retry on classic Supabase 413
        if "413" in msg or "Payload too large" in msg or "maximum allowed size" in msg:
            print(f"413 from Storage — forcing tighter compress: {exc}")
            tighter = shrink_video_for_storage(
                upload_path, max_bytes=min(STORAGE_SAFE_BYTES, 35_000_000)
            )
            data = tighter.read_bytes()
            print(f"Retry upload {len(data)} bytes → {bucket}/{key}")
            _upload_bytes(sb, bucket=bucket, key=key, data=data, content_type=content_type)
        else:
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


def storage_meta(obj: StoredObject) -> dict[str, Any]:
    return {
        "storage_bucket": obj.bucket,
        "storage_path": obj.path,
        "preview_uploaded": True,
    }
