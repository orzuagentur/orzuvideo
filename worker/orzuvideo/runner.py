from __future__ import annotations

import json
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
from orzuvideo.services.scriptgen import generate_creativity_script, generate_script
from orzuvideo.services.storage import storage_meta, upload_preview
from orzuvideo.services.youtube import upload_short


def _job_meta(job: dict) -> dict:
    meta = job.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            meta = {}
    return meta if isinstance(meta, dict) else {}


def _aspect_size(aspect: str) -> tuple[str, int, int]:
    a = (aspect or "9:16").strip()
    if a == "16:9":
        return "16:9", 1920, 1080
    if a == "1:1":
        return "1:1", 1080, 1080
    return "9:16", 1080, 1920


def _is_creativity_job(job: dict, meta: dict) -> bool:
    """Creativity = platform prompt video. Must NEVER use AI Training / YouTube settings."""
    source = str(meta.get("source") or "").strip().lower()
    pipeline = str(meta.get("pipeline") or "").strip().lower()
    if source == "creativity" or pipeline == "creativity":
        return True
    # Explicit platform draft without a YouTube channel
    if job.get("youtube_channel_id") is None and meta.get("publish") is False:
        return True
    return False


def process_job(job: dict) -> None:
    sb = db.get_supabase()
    job_id = job["id"]
    user_id = job["user_id"]
    work = TEMP_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)
    meta0 = _job_meta(job)
    user_brief = (meta0.get("user_brief") or "").strip() or None
    is_creativity = _is_creativity_job(job, meta0)

    # Default publish=True only for real YouTube jobs; Creativity never publishes
    if is_creativity:
        publish = False
    else:
        publish = bool(meta0.get("publish", True))

    try:
        channel_id = None if is_creativity else (
            job.get("youtube_channel_id")
            or meta0.get("youtube_channel_id")
            or None
        )

        training: dict | None = None
        out_w, out_h = 1080, 1920

        if is_creativity:
            # ── Creativity: prompt only — NO get_training(), NO YouTube channel ──
            print(
                f"[CREATIVITY] job={job_id} "
                f"aspect={meta0.get('aspect_ratio')} "
                f"duration_auto={meta0.get('duration_auto')} "
                f"brief={(user_brief or '')[:80]!r}"
            )
            if not user_brief:
                raise RuntimeError("Creativity job requires a user prompt")

            duration_auto = meta0.get("duration_auto")
            if duration_auto is None:
                duration_auto = meta0.get("duration_seconds") in (None, "auto")
            duration_auto = bool(duration_auto)
            fixed_dur = None
            if not duration_auto and meta0.get("duration_seconds") is not None:
                try:
                    fixed_dur = max(15, min(60, int(meta0["duration_seconds"])))
                except (TypeError, ValueError):
                    duration_auto = True
                    fixed_dur = None

            aspect, out_w, out_h = _aspect_size(str(meta0.get("aspect_ratio") or "9:16"))
            print(f"[CREATIVITY] render size {out_w}x{out_h} ({aspect})")

            training = {
                "voice_id": settings.elevenlabs_voice_id,
                "duration_auto": duration_auto,
                "duration_seconds": fixed_dur or 30,
                "music_mood": "cinematic emotional",
                "pexels_query": "cinematic lifestyle",
            }
            meta0 = {
                **meta0,
                "source": "creativity",
                "pipeline": "creativity",
                "publish": False,
                "aspect_ratio": aspect,
                "output_size": [out_w, out_h],
                "youtube_channel_id": None,
                "used_ai_training": False,
            }
            # Persist mode early so UI/debug show correct pipeline even if later steps fail
            db.update_job(
                sb,
                job_id,
                youtube_channel_id=None,
                metadata=meta0,
            )
            publish = False
        else:
            print(f"[YOUTUBE/TRAINING] job={job_id} channel={channel_id}")
            training = db.get_training(sb, user_id, youtube_channel_id=channel_id)
            if not training:
                raise RuntimeError(
                    "AI training not configured for this channel. Open Channel → AI Training."
                )

            if meta0.get("duration_auto"):
                training = {**training, "duration_auto": True}
            elif meta0.get("duration_seconds") is not None:
                try:
                    training = {
                        **training,
                        "duration_auto": False,
                        "duration_seconds": max(
                            15, min(60, int(meta0["duration_seconds"]))
                        ),
                    }
                except (TypeError, ValueError):
                    pass

            aspect, out_w, out_h = _aspect_size(str(meta0.get("aspect_ratio") or "9:16"))
            meta0 = {
                **meta0,
                "aspect_ratio": aspect,
                "output_size": [out_w, out_h],
                "used_ai_training": True,
            }

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
        assert training is not None

        if is_creativity:
            if not user_brief:
                raise RuntimeError("Creativity job requires a user prompt")
            script_data = generate_creativity_script(
                user_prompt=user_brief,
                duration_auto=bool(training.get("duration_auto", True)),
                duration_seconds=(
                    None
                    if training.get("duration_auto")
                    else int(training.get("duration_seconds") or 30)
                ),
                user_id=user_id,
                job_id=job_id,
            )
            # Apply AI-chosen language / mood back onto runtime training bag
            training = {
                **training,
                "language": script_data.get("language") or "en",
                "music_mood": script_data.get("music_mood")
                or training.get("music_mood"),
                "duration_seconds": script_data.get("duration_seconds")
                or training.get("duration_seconds"),
                "duration_auto": False,
            }
        else:
            avoid_topics = db.recent_video_topics(sb, user_id)
            script_data = generate_script(
                training,
                user_id=user_id,
                job_id=job_id,
                user_brief=user_brief,
                avoid_topics=avoid_topics,
            )

        script_update: dict = {
            "script_text": script_data["script"],
            "title": script_data["title"],
            "description": script_data["description"],
            "tags": script_data["tags"],
            "metadata": {
                **meta0,
                "hook": script_data["hook"],
                "pexels_queries": script_data["pexels_queries"],
                "language": script_data.get("language"),
                "music_mood": script_data.get("music_mood"),
            },
        }
        if script_data.get("duration_seconds") is not None:
            try:
                chosen = max(15, min(60, int(script_data["duration_seconds"])))
                script_update["duration_seconds"] = chosen
                script_update["metadata"] = {
                    **script_update["metadata"],
                    "duration_seconds": chosen,
                }
                training = {
                    **training,
                    "duration_seconds": chosen,
                    "duration_auto": False,
                }
            except (TypeError, ValueError):
                pass
        db.update_job(sb, job_id, **script_update)
        db.record_media_usage(
            sb,
            user_id=user_id,
            provider="topic",
            asset_id=(script_data.get("title") or job_id)[:120],
            job_id=job_id,
            title=script_data.get("title") or script_data.get("hook"),
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
        if is_creativity:
            montage = {
                "clip_count": 5,
                "avoid_reuse_days": 45,
                "music_volume_hook": 0.88,
                "music_volume_body": 0.58,
                "voice_volume": 1.05,
            }
        else:
            montage = db.get_montage_settings(sb, user_id)
        avoid_days = int(montage.get("avoid_reuse_days") or 60)
        clip_count = int(montage.get("clip_count") or 5)
        used_pexels = db.used_media_ids(sb, user_id, "pexels", days=avoid_days)
        used_jamendo = db.used_media_ids(sb, user_id, "jamendo", days=avoid_days)

        db.update_job(sb, job_id, status="fetching_media")
        queries = script_data["pexels_queries"] or [training.get("pexels_query")]
        clips, pexels_ids = download_stock_clips(
            queries,
            work / "clips",
            count=clip_count,
            exclude_ids=used_pexels,
        )
        for pid in pexels_ids:
            db.record_media_usage(
                sb,
                user_id=user_id,
                provider="pexels",
                asset_id=pid,
                job_id=job_id,
            )

        music_mood = (
            script_data.get("music_mood")
            or montage.get("music_mood")
            or training.get("music_mood")
            or "motivational epic"
        )
        jamendo = download_background_music(
            music_mood,
            work / "music.mp3",
            exclude_ids=used_jamendo,
        )
        music_path = jamendo.path
        if music_path is None or not music_path.exists():
            raise RuntimeError("Background music missing after download/fallback")
        if jamendo.id not in ("local", "generated"):
            db.record_media_usage(
                sb,
                user_id=user_id,
                provider="jamendo",
                asset_id=jamendo.id,
                job_id=job_id,
                title=jamendo.name,
                meta={"artist": jamendo.artist},
            )
        print(f"Background music ready: {music_path} ({music_path.stat().st_size} bytes)")
        credit = attribution_line(jamendo)
        description = script_data["description"]
        meta = {
            **meta0,
            "hook": script_data["hook"],
            "pexels_queries": script_data["pexels_queries"],
            "pexels_ids": pexels_ids,
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
            music_volume_hook=float(montage.get("music_volume_hook") or 0.88),
            music_volume_body=float(montage.get("music_volume_body") or 0.58),
            voice_volume=float(montage.get("voice_volume") or 1.05),
            size=(out_w, out_h),
        )
        db.update_job(sb, job_id, video_path=str(out_video), voice_path=str(voice_path))

        # Always upload to Supabase Storage — platform library depends on this file
        db.update_job(sb, job_id, status="uploading")
        stored = upload_preview(
            sb, user_id=user_id, job_id=job_id, video_path=out_video
        )
        preview_url = stored.public_url
        meta = {
            **meta,
            **storage_meta(stored),
        }
        try:
            db.update_job(
                sb,
                job_id,
                preview_url=preview_url,
                storage_path=stored.path,
                storage_bucket=stored.bucket,
                metadata=meta,
            )
        except Exception as col_exc:
            # Pre-migration DBs without storage_path columns
            print(f"storage_path columns missing, using metadata only: {col_exc}")
            db.update_job(
                sb,
                job_id,
                preview_url=preview_url,
                metadata=meta,
            )
        print(f"Preview uploaded: {preview_url}")

        # 5) Platform-only — no YouTube
        if not publish:
            db.update_job(
                sb,
                job_id,
                status="ready",
                completed_at=datetime.now(timezone.utc).isoformat(),
                metadata=meta,
            )
            print(f"Video ready in Storage (not published to YouTube): {job_id}")
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
    # Prefer Instagram queue when present, then YouTube
    ig_job = db.claim_next_instagram_job(sb)
    if ig_job:
        from orzuvideo.ig_runner import process_instagram_job

        process_instagram_job(ig_job)
        return True

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
