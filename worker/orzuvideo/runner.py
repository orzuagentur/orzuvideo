from __future__ import annotations

import json
import shutil
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from orzuvideo.config import TEMP_DIR, settings
from orzuvideo.pipeline import clipping as clip_pipe
from orzuvideo.pipeline.editor import build_short
from orzuvideo.pipeline.media import ffprobe_duration, synthesize_with_timestamps
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


def _format_aspect(video_format: str | None) -> str:
    fmt = (video_format or "shorts").strip().lower()
    if fmt in ("video", "long", "longform", "youtube_video", "simple", "simple_video"):
        return "16:9"
    return "9:16"


def _duration_bounds(video_format: str | None) -> tuple[int, int]:
    fmt = (video_format or "shorts").strip().lower()
    if fmt in ("video", "long", "longform", "youtube_video"):
        return 90, 600
    if fmt in ("simple", "simple_video"):
        return 60, 300
    return 15, 60


def _clamp_duration(seconds: int, video_format: str | None) -> int:
    lo, hi = _duration_bounds(video_format)
    return max(lo, min(hi, int(seconds)))


def _clip_count_for_duration(base: int, duration_sec: int) -> int:
    """Longer videos need more B-roll clips so cuts don't loop too hard."""
    base = max(3, int(base or 5))
    if duration_sec <= 60:
        return base
    if duration_sec <= 180:
        return min(18, max(base, 8))
    if duration_sec <= 360:
        return min(24, max(base, 12))
    return min(30, max(base, 16))


def _is_clipping_job(meta: dict) -> bool:
    source = str(meta.get("source") or "").strip().lower()
    pipeline = str(meta.get("pipeline") or "").strip().lower()
    return source in ("ai_clipping", "clipping") or pipeline in (
        "ai_clipping",
        "clipping",
    )


def _is_creativity_job(job: dict, meta: dict) -> bool:
    """Creativity = platform prompt video. Must NEVER use AI Training / YouTube settings."""
    if _is_clipping_job(meta):
        return False
    source = str(meta.get("source") or "").strip().lower()
    pipeline = str(meta.get("pipeline") or "").strip().lower()
    if source == "creativity" or pipeline == "creativity":
        return True
    # Explicit platform draft without a YouTube channel
    if job.get("youtube_channel_id") is None and meta.get("publish") is False:
        return True
    return False


def _download_job_video(url: str, dest: Path) -> Path:
    import httpx

    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=300.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest


def _process_clipping_job(job: dict, *, sb, work: Path) -> None:
    """Long device video → short viral cut (no YouTube / no AI Training)."""
    job_id = job["id"]
    user_id = job["user_id"]
    meta0 = _job_meta(job)

    aspect, out_w, out_h = _aspect_size(str(meta0.get("aspect_ratio") or "9:16"))
    try:
        target_dur = float(meta0.get("duration_seconds") or 30)
    except (TypeError, ValueError):
        target_dur = 30.0
    target_dur = max(15.0, min(60.0, target_dur))

    add_subs = bool(meta0.get("add_subtitles", True))
    add_music = bool(meta0.get("add_music", True))
    add_effects = bool(meta0.get("add_effects", True))
    instructions = (meta0.get("user_brief") or meta0.get("instructions") or "").strip() or None

    source_url = (
        str(meta0.get("source_url") or "").strip()
        or str(job.get("preview_url") or "").strip()
    )
    if not source_url:
        raise RuntimeError("AI Clipping job missing source video URL")

    print(
        f"[CLIPPING] job={job_id} aspect={aspect} target={target_dur}s "
        f"subs={add_subs} music={add_music} effects={add_effects}"
    )

    db.update_job(
        sb,
        job_id,
        status="generating_script",
        metadata={
            **meta0,
            "source": "ai_clipping",
            "pipeline": "ai_clipping",
            "publish": False,
            "aspect_ratio": aspect,
            "output_size": [out_w, out_h],
            "duration_seconds": int(target_dur),
        },
    )

    source = work / "source.mp4"
    _download_job_video(source_url, source)
    source_dur = ffprobe_duration(source)
    if source_dur < 8:
        raise RuntimeError("Source video is too short (need at least ~8 seconds)")

    transcript = ""
    words: list = []
    audio_full = work / "source_audio.mp3"
    try:
        clip_pipe.extract_audio(source, audio_full)
        transcript, words = clip_pipe.transcribe_source(
            audio_full, user_id=user_id, job_id=job_id
        )
    except Exception as exc:
        print(f"[CLIPPING] transcription skipped: {exc}")

    speech = clip_pipe.has_meaningful_speech(transcript, words)
    # Auto-enable subs only when speech exists and user asked
    want_subs = add_subs and speech

    start, end, title = clip_pipe.pick_clip_window(
        source_duration=source_dur,
        target_duration=target_dur,
        transcript=transcript,
        instructions=instructions,
        user_id=user_id,
        job_id=job_id,
    )
    clip_len = max(1.0, end - start)
    print(f"[CLIPPING] window {start:.1f}-{end:.1f}s title={title!r} speech={speech}")

    db.update_job(
        sb,
        job_id,
        status="editing",
        title=title,
        script_text=(transcript[:2000] if transcript else None),
        duration_seconds=int(round(clip_len)),
        metadata={
            **meta0,
            "source": "ai_clipping",
            "pipeline": "ai_clipping",
            "publish": False,
            "aspect_ratio": aspect,
            "output_size": [out_w, out_h],
            "duration_seconds": int(round(clip_len)),
            "clip_start": start,
            "clip_end": end,
            "has_speech": speech,
        },
    )

    cut = work / "cut.mp4"
    clip_pipe.cut_segment(source, start, clip_len, cut)

    framed = work / "framed.mp4"
    clip_pipe.reframe_clip(
        cut, framed, width=out_w, height=out_h, effects=add_effects
    )

    voice_a = work / "clip_voice.aac"
    clip_pipe.extract_clip_audio(framed, voice_a)

    music_path = None
    music_attr = None
    if add_music:
        db.update_job(sb, job_id, status="fetching_media")
        try:
            mood = "energetic upbeat"
            if instructions:
                mood = f"energetic {instructions[:40]}"
            track = download_background_music(
                mood,
                work / "music",
                exclude_ids=set(),
            )
            if track and track.path:
                music_path = track.path
                music_attr = attribution_line(track)
        except Exception as exc:
            print(f"[CLIPPING] music skipped: {exc}")

    mixed_a = work / "mixed.aac"
    clip_pipe.mix_clip_music(voice_a, music_path, mixed_a, duration=clip_len)

    muxed = work / "muxed.mp4"
    clip_pipe.mux_video_audio(framed, mixed_a, muxed)

    final = work / "clip_final.mp4"
    if want_subs:
        window_words = clip_pipe.words_in_window(words, start, end)
        clip_pipe.burn_subs_keep_audio(
            muxed,
            window_words,
            final,
            work_dir=work,
            size=(out_w, out_h),
        )
    else:
        final.write_bytes(muxed.read_bytes())

    db.update_job(sb, job_id, status="uploading")
    stored = upload_preview(sb, user_id=user_id, job_id=job_id, video_path=final)
    meta_done = {
        **meta0,
        "source": "ai_clipping",
        "pipeline": "ai_clipping",
        "publish": False,
        "aspect_ratio": aspect,
        "output_size": [out_w, out_h],
        "duration_seconds": int(round(clip_len)),
        "clip_start": start,
        "clip_end": end,
        "has_speech": speech,
        "add_subtitles": want_subs,
        "add_music": bool(music_path),
        "add_effects": add_effects,
        "music_attribution": music_attr,
        **storage_meta(stored),
    }
    db.update_job(
        sb,
        job_id,
        status="ready",
        title=title,
        preview_url=stored.public_url,
        video_path=str(final),
        completed_at=datetime.now(timezone.utc).isoformat(),
        duration_seconds=int(round(clip_len)),
        storage_path=stored.path,
        storage_bucket=stored.bucket,
        metadata=meta_done,
    )
    print(f"[CLIPPING] ready job={job_id} url={stored.public_url}")


def process_job(job: dict) -> None:
    sb = db.get_supabase()
    job_id = job["id"]
    user_id = job["user_id"]
    work = TEMP_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)
    meta0 = _job_meta(job)
    user_brief = (meta0.get("user_brief") or "").strip() or None

    if _is_clipping_job(meta0):
        try:
            _process_clipping_job(job, sb=sb, work=work)
        except Exception as exc:
            db.update_job(
                sb,
                job_id,
                status="failed",
                error_message=f"{exc}\n{traceback.format_exc()[-1500:]}",
            )
            raise
        return

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
                        "duration_seconds": _clamp_duration(
                            int(meta0["duration_seconds"]),
                            training.get("video_format"),
                        ),
                    }
                except (TypeError, ValueError):
                    pass

            # Aspect from Training format (Short = 9:16, Video/Simple = 16:9)
            # unless the job explicitly overrides aspect_ratio
            fmt_aspect = _format_aspect(str(training.get("video_format") or "shorts"))
            aspect, out_w, out_h = _aspect_size(
                str(meta0.get("aspect_ratio") or fmt_aspect)
            )
            meta0 = {
                **meta0,
                "aspect_ratio": aspect,
                "output_size": [out_w, out_h],
                "video_format": training.get("video_format") or "shorts",
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
                fmt = str(
                    (training or {}).get("video_format")
                    or meta0.get("video_format")
                    or "shorts"
                )
                chosen = _clamp_duration(int(script_data["duration_seconds"]), fmt)
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
        # Apply aspect from script/format if YouTube training path
        if not is_creativity and script_data.get("aspect_ratio"):
            aspect, out_w, out_h = _aspect_size(str(script_data["aspect_ratio"]))
            script_update["metadata"] = {
                **script_update["metadata"],
                "aspect_ratio": aspect,
                "output_size": [out_w, out_h],
            }
            meta0 = {
                **meta0,
                "aspect_ratio": aspect,
                "output_size": [out_w, out_h],
            }
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
        base_clips = int(montage.get("clip_count") or 5)
        try:
            dur_for_clips = int(
                (training or {}).get("duration_seconds")
                or meta0.get("duration_seconds")
                or 45
            )
        except (TypeError, ValueError):
            dur_for_clips = 45
        clip_count = (
            base_clips
            if is_creativity
            else _clip_count_for_duration(base_clips, dur_for_clips)
        )
        used_pexels = db.used_media_ids(sb, user_id, "pexels", days=avoid_days)
        used_jamendo = db.used_media_ids(sb, user_id, "jamendo", days=avoid_days)

        db.update_job(sb, job_id, status="fetching_media")
        queries = [
            q
            for q in (script_data.get("pexels_queries") or [])
            if isinstance(q, str) and q.strip()
        ]
        fallback_q = str(training.get("pexels_query") or "").strip()
        if not queries:
            queries = [fallback_q] if fallback_q else ["cinematic b-roll"]
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

        music_prefs = training.get("music_prefs") or {}
        if isinstance(music_prefs, str):
            try:
                import json as _json

                music_prefs = _json.loads(music_prefs)
            except Exception:
                music_prefs = {}
        if not isinstance(music_prefs, dict):
            music_prefs = {}

        preferred_ids = [
            str(x)
            for x in (music_prefs.get("selected_track_ids") or [])
            if x
        ]
        # Custom group tracks if active group is custom
        active_gid = str(
            training.get("music_group")
            or music_prefs.get("active_group_id")
            or ""
        ).strip()
        for cg in music_prefs.get("custom_groups") or []:
            if not isinstance(cg, dict):
                continue
            if str(cg.get("id") or "") == active_gid:
                preferred_ids = [
                    str(t.get("id") if isinstance(t, dict) else t)
                    for t in (cg.get("tracks") or [])
                    if t
                ] + preferred_ids
                break

        # Built-in group id → search mood (no forced motivational bias)
        group_mood_map = {
            "epic": "epic soundtrack orchestral",
            "motivational": "motivational energetic upbeat",
            "dark": "dark ambient electronic intense",
            "calm": "calm ambient chill relaxing",
            "upbeat": "happy upbeat pop energetic",
            "lofi": "lofi chill ambient",
            "workout": "workout energetic hiphop electronic",
            "luxury": "luxury ambient cinematic soft",
        }
        music_mood = (
            group_mood_map.get(active_gid)
            or str(script_data.get("music_mood") or "").strip()
            or str(montage.get("music_mood") or "").strip()
            or str(training.get("music_mood") or "").strip()
            or "cinematic soundtrack"
        )

        user_music_vol = training.get("music_volume")
        try:
            user_vol = float(user_music_vol) if user_music_vol is not None else None
        except (TypeError, ValueError):
            user_vol = None
        if user_vol is not None:
            body_vol = max(0.15, min(1.0, user_vol))
            hook_vol = min(1.2, body_vol + 0.25)
        else:
            hook_vol = float(montage.get("music_volume_hook") or 0.88)
            body_vol = float(montage.get("music_volume_body") or 0.58)

        voice_vol_raw = training.get("voice_volume")
        if voice_vol_raw is None and isinstance(music_prefs, dict):
            voice_vol_raw = music_prefs.get("voice_volume")
        if voice_vol_raw is None:
            voice_vol_raw = montage.get("voice_volume")
        try:
            voice_vol = max(0.5, min(1.4, float(voice_vol_raw if voice_vol_raw is not None else 1.05)))
        except (TypeError, ValueError):
            voice_vol = 1.05

        jamendo = download_background_music(
            music_mood,
            work / "music.mp3",
            exclude_ids=used_jamendo,
            preferred_ids=preferred_ids,
            force_mood_bias=False,
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
            music_volume_hook=hook_vol,
            music_volume_body=body_vol,
            voice_volume=voice_vol,
            size=(out_w, out_h),
        )
        db.update_job(sb, job_id, video_path=str(out_video), voice_path=str(voice_path))

        # Cover image from the finished Short (Creativity cards + YouTube thumb)
        from orzuvideo.services.thumbnail import extract_thumbnail, upload_thumbnail

        thumb_local = work / "thumb.jpg"
        thumb_url = None
        try:
            extract_thumbnail(out_video, thumb_local, at_sec=1.2)
            thumb_stored = upload_thumbnail(
                sb, user_id=user_id, job_id=job_id, image_path=thumb_local
            )
            thumb_url = thumb_stored.public_url
            db.update_job(sb, job_id, thumbnail_url=thumb_url)
            print(f"Thumbnail ready: {thumb_url}")
        except Exception as thumb_exc:
            print(f"Thumbnail extract/upload skipped: {thumb_exc}")
            thumb_local = None

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
            thumbnail_path=thumb_local if thumb_local and thumb_local.exists() else None,
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
    print("OrzuAi worker started. Polling for jobs + comment replies...")
    sb = db.get_supabase()
    idle_ticks = 0
    while True:
        try:
            db.beat_presence(sb, working=False)
            worked = process_next_job()
            if worked:
                db.beat_presence(sb, working=True)
                idle_ticks = 0
            else:
                idle_ticks += 1
                # Every ~2 idle polls (or always every 4th tick), scan comments
                if idle_ticks % 2 == 0:
                    try:
                        from orzuvideo.comment_runner import process_comment_replies

                        n = process_comment_replies()
                        if n:
                            print(f"[comments] posted {n} AI repl(ies)")
                            db.beat_presence(sb, working=True)
                    except Exception as ce:
                        print(f"[comments] loop error: {ce}")
                time.sleep(settings.poll_interval_sec)
        except KeyboardInterrupt:
            print("Worker stopped.")
            break
        except Exception as e:
            print(f"Worker loop error: {e}")
            time.sleep(settings.poll_interval_sec)
