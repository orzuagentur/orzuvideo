from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from orzuvideo.config import settings

# Soft compress only for very large files (R2 has no 50MB free-tier wall)
STORAGE_SAFE_BYTES = 400_000_000
MAX_PREVIEW_BYTES = 500_000_000  # 500 MB


@dataclass(frozen=True)
class StoredObject:
    bucket: str
    path: str
    public_url: str


def media_bucket() -> str:
    return (settings.r2_bucket or "").strip() or "orzu-media"


# Back-compat alias used across runner / thumbnail
PREVIEW_BUCKET = media_bucket()


def preview_object_path(user_id: str, job_id: str) -> str:
    return f"{user_id}/{job_id}.mp4"


def thumb_object_path(user_id: str, job_id: str) -> str:
    return f"{user_id}/{job_id}_thumb.jpg"


def r2_configured() -> bool:
    return bool(
        settings.r2_account_id
        and settings.r2_access_key_id
        and settings.r2_secret_access_key
        and settings.r2_bucket
    )


_client = None


def get_r2_client():
    global _client
    if _client is not None:
        return _client
    if not r2_configured():
        raise RuntimeError(
            "Cloudflare R2 is not configured "
            "(R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)"
        )
    endpoint = (settings.r2_endpoint or "").strip() or (
        f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
    )
    _client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name=settings.r2_region or "auto",
        config=Config(signature_version="s3v4"),
    )
    return _client


def public_object_url(key: str) -> str:
    base = (settings.r2_public_base_url or "").strip().rstrip("/")
    if not base:
        # Signed playback still works; public URL needs custom domain / r2.dev
        raise RuntimeError(
            "R2_PUBLIC_BASE_URL is required (custom domain or https://pub-xxx.r2.dev)"
        )
    return f"{base}/{key.lstrip('/')}"


def ensure_bucket(*_args: Any, **_kwargs: Any) -> None:
    """No-op: R2 buckets are created in the Cloudflare dashboard."""
    return


def _run_ffmpeg(args: list[str]) -> None:
    cmd = ["ffmpeg", "-y", *args]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg compress failed:\n{(proc.stderr or '')[-2000:]}")


def shrink_video_for_storage(path: Path, *, max_bytes: int = STORAGE_SAFE_BYTES) -> Path:
    """Re-encode oversized MP4 before upload (optional cost/size guard)."""
    if not path.exists():
        raise RuntimeError(f"Local file missing for compress: {path}")
    size = path.stat().st_size
    if size <= max_bytes:
        return path

    print(
        f"Video {size / 1_000_000:.1f} MB exceeds soft limit "
        f"({max_bytes / 1_000_000:.0f} MB) — compressing for upload"
    )
    out = path.with_name(f"{path.stem}_storage.mp4")
    attempts = [("28", "128k"), ("30", "96k"), ("32", "64k")]
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
        except Exception as exc:
            last_err = exc
            print(f"Compress attempt crf={crf} failed: {exc}")

    if out.exists() and out.stat().st_size < size:
        return out
    if last_err:
        raise RuntimeError(f"Could not compress video for storage: {last_err}") from last_err
    raise RuntimeError(
        f"Video too large for storage ({size} bytes) and compress produced no smaller file"
    )


def upload_bytes(
    *,
    key: str,
    data: bytes,
    content_type: str,
    bucket: str | None = None,
) -> StoredObject:
    bkt = bucket or media_bucket()
    client = get_r2_client()
    client.put_object(
        Bucket=bkt,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    url = public_object_url(key)
    print(f"R2 OK: {bkt}/{key} ({len(data)} bytes)")
    return StoredObject(bucket=bkt, path=key, public_url=url)


def download_object(key: str, dest: Path, *, bucket: str | None = None) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    bkt = bucket or media_bucket()
    client = get_r2_client()
    try:
        obj = client.get_object(Bucket=bkt, Key=key)
    except ClientError as exc:
        raise RuntimeError(f"R2 download failed {bkt}/{key}: {exc}") from exc
    body = obj["Body"].read()
    dest.write_bytes(body)
    return dest


def delete_object(key: str, *, bucket: str | None = None) -> None:
    bkt = bucket or media_bucket()
    get_r2_client().delete_object(Bucket=bkt, Key=key)


def delete_prefix(prefix: str, *, bucket: str | None = None) -> int:
    bkt = bucket or media_bucket()
    client = get_r2_client()
    prefix = prefix if prefix.endswith("/") else f"{prefix}/"
    deleted = 0
    token = None
    while True:
        kwargs: dict[str, Any] = {"Bucket": bkt, "Prefix": prefix}
        if token:
            kwargs["ContinuationToken"] = token
        resp = client.list_objects_v2(**kwargs)
        contents = resp.get("Contents") or []
        if contents:
            client.delete_objects(
                Bucket=bkt,
                Delete={
                    "Objects": [{"Key": o["Key"]} for o in contents if o.get("Key")],
                    "Quiet": True,
                },
            )
            deleted += len(contents)
        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")
    return deleted


def object_exists(key: str, *, bucket: str | None = None) -> bool:
    bkt = bucket or media_bucket()
    try:
        get_r2_client().head_object(Bucket=bkt, Key=key)
        return True
    except ClientError:
        return False


def upload_public_file(
    sb: Any = None,
    *,
    bucket: str | None = None,
    key: str,
    path: Path,
    content_type: str,
) -> StoredObject:
    """Upload a local file to Cloudflare R2. `sb` is ignored (legacy arg)."""
    _ = sb
    if not path.exists():
        raise RuntimeError(f"Local file missing for upload: {path}")

    upload_path = path
    bkt = bucket or media_bucket()
    if content_type.startswith("video/"):
        upload_path = shrink_video_for_storage(path)

    size = upload_path.stat().st_size
    min_bytes = 800 if content_type.startswith("image/") else 512
    if size < min_bytes:
        raise RuntimeError(f"Local file too small ({size} bytes): {upload_path}")
    if size > MAX_PREVIEW_BYTES:
        raise RuntimeError(
            f"File exceeds storage limit ({size} > {MAX_PREVIEW_BYTES} bytes): {upload_path}"
        )

    data = upload_path.read_bytes()
    print(f"Uploading {size} bytes → R2 {bkt}/{key}")
    return upload_bytes(key=key, data=data, content_type=content_type, bucket=bkt)


def upload_preview(
    sb: Any = None, *, user_id: str, job_id: str, video_path: Path
) -> StoredObject:
    """Upload finished platform video to R2 and return storage refs."""
    return upload_public_file(
        sb,
        bucket=media_bucket(),
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
