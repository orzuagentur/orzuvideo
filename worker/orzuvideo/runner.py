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
from orzuvideo.services.youtube import upload_short


def process_job(job: dict) -> None:
    sb = db.get_supabase()
    job_id = job["id"]
    user_id = job["user_id"]
    work = TEMP_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)

    try:
        training = db.get_training(sb, user_id)
        if not training:
            raise RuntimeError("AI training not configured. Train the AI once in the dashboard.")

        profile = db.get_profile(sb, user_id)
        if not profile or not profile.get("youtube_connected"):
            raise RuntimeError("YouTube is not connected.")

        # 1) Script
        db.update_job(sb, job_id, status="generating_script")
        script_data = generate_script(training, user_id=user_id, job_id=job_id)
        db.update_job(
            sb,
            job_id,
            script_text=script_data["script"],
            title=script_data["title"],
            description=script_data["description"],
            tags=script_data["tags"],
            metadata={"hook": script_data["hook"], "pexels_queries": script_data["pexels_queries"]},
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

        # 3) Media
        db.update_job(sb, job_id, status="fetching_media")
        queries = script_data["pexels_queries"] or [training.get("pexels_query")]
        clips = download_stock_clips(queries, work / "clips", count=3)
        jamendo = download_background_music(
            training.get("music_mood") or "cinematic motivational",
            work / "music.mp3",
        )
        music_path = jamendo.path if jamendo else None
        credit = attribution_line(jamendo)
        description = script_data["description"]
        if credit:
            description = f"{description}\n\n{credit}"
            db.update_job(
                sb,
                job_id,
                description=description,
                metadata={
                    "hook": script_data["hook"],
                    "pexels_queries": script_data["pexels_queries"],
                    "jamendo": {
                        "id": jamendo.id if jamendo else None,
                        "name": jamendo.name if jamendo else None,
                        "artist": jamendo.artist if jamendo else None,
                        "url": jamendo.shareurl if jamendo else None,
                    },
                },
            )

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
        )
        db.update_job(sb, job_id, video_path=str(out_video), voice_path=str(voice_path))

        # 5) Upload
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
        from orzuvideo.services.usage import log_usage

        log_usage(
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
        # Keep failed artifacts for debug; clean success after short delay
        if job.get("keep_temp"):
            return
        try:
            # Only wipe if published
            current = (
                sb.table("video_jobs").select("status").eq("id", job_id).limit(1).execute()
            )
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
    while True:
        try:
            worked = process_next_job()
            if not worked:
                time.sleep(settings.poll_interval_sec)
        except KeyboardInterrupt:
            print("Worker stopped.")
            break
        except Exception as e:
            print(f"Worker loop error: {e}")
            time.sleep(settings.poll_interval_sec)
