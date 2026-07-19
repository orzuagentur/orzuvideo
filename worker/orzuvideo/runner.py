from __future__ import annotations

import shutil
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from orzuvideo.config import TEMP_DIR, settings
from orzuvideo.pipeline.editor import build_short
from orzuvideo.pipeline.media import synthesize_with_timestamps
from orzuvideo.services import db
from orzuvideo.services.jamendo import attribution_line, download_background_music
from orzuvideo.services.pexels import download_stock_clips
from orzuvideo.services.scriptgen import generate_script
from orzuvideo.services.storage import upload_preview
from orzuvideo.services.youtube import upload_short


def _job_meta(job: dict) -> dict:
    meta = job.get("metadata") or {}
    return meta if isinstance(meta, dict) else {}


def process_job(job: dict) -> None:
    sb = db.get_supabase()
    job_id = job["id"]
    user_id = job["user_id"]
    work = TEMP_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)
    meta0 = _job_meta(job)
    publish = bool(meta0.get("publish", True))
    user_brief = (meta0.get("user_brief") or "").strip() or None

    try:
        training = db.get_training(sb, user_id)
        if not training:
            raise RuntimeError("AI training not configured. Train the AI once in the dashboard.")

        profile = db.get_profile(sb, user_id)
        if publish and (not profile or not profile.get("youtube_connected")):
            raise RuntimeError("YouTube is not connected.")

        # Publish-only path: already-rendered draft
        if meta0.get("publish_existing") and job.get("preview_url"):
            db.update_job(sb, job_id, status="uploading")
            if not profile or not profile.get("youtube_connected"):
                raise RuntimeError("YouTube is not connected.")
            # Prefer local file if still present, else download preview
            local = Path(job.get("video_path") or "")
            video_file = local if local.exists() else (work / "from_preview.mp4")
            if not local.exists():
                import httpx

                with httpx.Client(timeout=180.0, follow_redirects=True) as client:
                    r = client.get(job["preview_url"])
                    r.raise_for_status()
                    video_file.write_bytes(r.content)
            yt = upload_short(
                profile,
                video_file,
                title=job.get("title") or "Short",
                description=job.get("description") or "",
                tags=job.get("tags") or ["shorts"],
            )
            if yt.get("access_token"):
                sb.table("profiles").update(
                    {"youtube_access_token": yt["access_token"]}
                ).eq("id", user_id).execute()
            db.update_job(
                sb,
                job_id,
                status="published",
                youtube_video_id=yt["youtube_video_id"],
                youtube_url=yt["youtube_url"],
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
            db.record_published(
                sb,
                user_id=user_id,
                job_id=job_id,
                youtube_video_id=yt["youtube_video_id"],
                youtube_url=yt["youtube_url"],
                title=job.get("title") or "Short",
                script_text=job.get("script_text") or "",
            )
            return

        # 1) Script
        db.update_job(sb, job_id, status="generating_script")
        script_data = generate_script(
            training,
            user_id=user_id,
            job_id=job_id,
            user_brief=user_brief,
        )
        db.update_job(
            sb,
            job_id,
            script_text=script_data["script"],
            title=script_data["title"],
            description=script_data["description"],
            tags=script_data["tags"],
            metadata={
                **meta0,
                "hook": script_data["hook"],
                "pexels_queries": script_data["pexels_queries"],
            },
        )

        # 2) Voice + timings
        db.update_job(sb, job_id, status="generating_voice")
        voice_path = work / "voice.mp3"
        words = synthesize_with_timestamps(
            script_data["script"],
            voice_path,
            voice_id=training.get("voice_id") or settings.elevenlabs_voice_id,
        )
        from orzuvideo.services.usage import estimate_elevenlabs_cost, log_usage

        chars = len(script_data["script"])
        log_usage(
            user_id=user_id,
            job_id=job_id,
            provider="elevenlabs",
            kind="tts",
            units=chars,
            unit_label="chars",
            cost_usd=estimate_elevenlabs_cost(chars),
        )

        # 3) Media — more clips for pro montage
        db.update_job(sb, job_id, status="fetching_media")
        queries = script_data["pexels_queries"] or [training.get("pexels_query")]
        clips = download_stock_clips(queries, work / "clips", count=5)
        jamendo = download_background_music(
            training.get("music_mood") or "cinematic motivational",
            work / "music.mp3",
        )
        music_path = jamendo.path
        if music_path is None or not music_path.exists():
            raise RuntimeError("Background music missing after download/fallback")
        print(f"Background music ready: {music_path} ({music_path.stat().st_size} bytes)")
        credit = attribution_line(jamendo)
        description = script_data["description"]
        meta = {
            **meta0,
            "hook": script_data["hook"],
            "pexels_queries": script_data["pexels_queries"],
            "jamendo": {
                "id": jamendo.id,
                "name": jamendo.name,
                "artist": jamendo.artist,
                "url": jamendo.shareurl,
            },
            "music_attached": True,
            "music_bytes": music_path.stat().st_size,
            "publish": publish,
            "user_brief": user_brief,
            "clip_count": len(clips),
        }
        if credit:
            description = f"{description}\n\n{credit}"
        db.update_job(sb, job_id, description=description, metadata=meta)

        # 4) Edit
        db.update_job(sb, job_id, status="editing")
        out_video = work / "short_final.mp4"
        build_short(
            clips=clips,
            voice_path=voice_path,
            music_path=music_path,
            words=words,
            work_dir=work / "edit",
            output_path=out_video,
            emphasis=script_data.get("subtitle_emphasis"),
            hook_text=script_data.get("hook"),
        )
        db.update_job(sb, job_id, video_path=str(out_video), voice_path=str(voice_path))

        # Always upload preview for in-app playback
        preview_url = None
        try:
            preview_url = upload_preview(
                sb, user_id=user_id, job_id=job_id, video_path=out_video
            )
            db.update_job(sb, job_id, preview_url=preview_url)
            print(f"Preview uploaded: {preview_url}")
        except Exception as exc:
            print(f"Preview upload failed (continuing): {exc}")

        # 5) Draft only — no YouTube
        if not publish:
            db.update_job(
                sb,
                job_id,
                status="ready",
                completed_at=datetime.now(timezone.utc).isoformat(),
                metadata={**meta, "preview_uploaded": bool(preview_url)},
            )
            print(f"Draft ready (not published): {job_id}")
            return

        # 6) Publish to YouTube
        db.update_job(sb, job_id, status="uploading")
        yt = upload_short(
            profile,
            out_video,
            title=script_data["title"],
            description=description,
            tags=script_data["tags"],
        )

        if yt.get("access_token"):
            sb.table("profiles").update(
                {"youtube_access_token": yt["access_token"]}
            ).eq("id", user_id).execute()

        db.update_job(
            sb,
            job_id,
            status="published",
            youtube_video_id=yt["youtube_video_id"],
            youtube_url=yt["youtube_url"],
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        db.record_published(
            sb,
            user_id=user_id,
            job_id=job_id,
            youtube_video_id=yt["youtube_video_id"],
            youtube_url=yt["youtube_url"],
            title=script_data["title"],
            script_text=script_data["script"],
        )
        from orzuvideo.services.usage import log_usage as log_usage2

        log_usage2(
            user_id=user_id,
            job_id=job_id,
            provider="youtube",
            kind="upload",
            units=1,
            unit_label="actions",
            cost_usd=0,
            meta={"youtube_video_id": yt["youtube_video_id"]},
        )
    except Exception as exc:
        db.update_job(
            sb,
            job_id,
            status="failed",
            error_message=f"{exc}\n{traceback.format_exc()[-1500:]}",
        )
        raise
    finally:
        if job.get("keep_temp"):
            return
        try:
            current = (
                sb.table("video_jobs").select("status").eq("id", job_id).limit(1).execute()
            )
            # Keep drafts locally for a bit; wipe only after YouTube publish
            if current.data and current.data[0]["status"] == "published":
                shutil.rmtree(work, ignore_errors=True)
        except Exception:
            pass


def process_next_job() -> bool:
    sb = db.get_supabase()
    job = db.claim_next_job(sb)
    if not job:
        return False
    process_job(job)
    return True


def run_forever() -> None:
    print("OrzuVideo worker started. Polling for jobs...")
    sb = db.get_supabase()
    while True:
        try:
            db.beat_presence(sb, working=False)
            worked = process_next_job()
            if worked:
                db.beat_presence(sb, working=True)
            if not worked:
                time.sleep(settings.poll_interval_sec)
        except KeyboardInterrupt:
            print("Worker stopped.")
            break
        except Exception as e:
            print(f"Worker loop error: {e}")
            time.sleep(settings.poll_interval_sec)
