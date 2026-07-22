from __future__ import annotations

import json
import shutil
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from orzuvideo.config import TEMP_DIR, settings
from orzuvideo.pipeline import clipping as clip_pipe
from orzuvideo.pipeline import reedit as reedit_pipe
from orzuvideo.pipeline.editor import build_short, mix_audio
from orzuvideo.pipeline.media import ffprobe_duration, synthesize_with_timestamps
from orzuvideo.services import db
from orzuvideo.services.media_pick import (
    exclude_used_media,
    fetch_background_music,
    merge_optional_training,
)
from orzuvideo.services.pexels import download_stock_clips
from orzuvideo.services.scriptgen import generate_creativity_script, generate_script
from orzuvideo.services.storage import (
    delete_object,
    delete_prefix,
    download_object,
    media_bucket,
    r2_configured,
    storage_meta,
    upload_preview,
)
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


def _is_reedit_job(meta: dict) -> bool:
    source = str(meta.get("source") or "").strip().lower()
    pipeline = str(meta.get("pipeline") or "").strip().lower()
    return source == "reedit" or pipeline == "reedit"


def _is_clipping_job(meta: dict) -> bool:
    source = str(meta.get("source") or "").strip().lower()
    pipeline = str(meta.get("pipeline") or "").strip().lower()
    return source in ("ai_clipping", "clipping") or pipeline in (
        "ai_clipping",
        "clipping",
    )


def _is_creativity_job(job: dict, meta: dict) -> bool:
    """Creativity = platform prompt video. Must NEVER use AI Training / YouTube settings."""
    if _is_clipping_job(meta) or _is_reedit_job(meta):
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
    """One or more source videos → short viral cut (no YouTube / no AI Training)."""
    job_id = job["id"]
    user_id = job["user_id"]
    meta0 = _job_meta(job)

    aspect, out_w, out_h = _aspect_size(str(meta0.get("aspect_ratio") or "9:16"))
    try:
        target_dur = float(meta0.get("duration_seconds") or 30)
    except (TypeError, ValueError):
        target_dur = 30.0
    target_dur = max(15.0, min(60.0, target_dur))

    add_music = bool(meta0.get("add_music", True))
    # Always apply AI polish
    add_effects = True
    add_transitions = True
    use_voice = bool(meta0.get("use_voice", True))
    voice_id = str(meta0.get("voice_id") or settings.elevenlabs_voice_id or "").strip()
    music_track_id = str(meta0.get("music_track_id") or "").strip() or None
    music_group = str(meta0.get("music_group") or "").strip() or None
    instructions = (meta0.get("user_brief") or meta0.get("instructions") or "").strip() or None

    raw_sources = meta0.get("sources")
    sources: list[dict] = []
    if isinstance(raw_sources, list) and raw_sources:
        for s in raw_sources:
            if isinstance(s, dict):
                sources.append(s)
    if not sources:
        sources = [
            {
                "url": str(meta0.get("source_url") or job.get("preview_url") or "").strip(),
                "storage_path": meta0.get("source_storage_path") or job.get("storage_path"),
                "storage_bucket": job.get("storage_bucket") or "short-previews",
                "title": job.get("title") or "AI Clip",
            }
        ]
    sources = [s for s in sources if s.get("url") or s.get("storage_path")]
    if not sources:
        raise RuntimeError("AI Clipping job missing source video")

    print(
        f"[CLIPPING] job={job_id} sources={len(sources)} aspect={aspect} "
        f"target={target_dur}s voice={use_voice} music={add_music} "
        f"track={music_track_id} group={music_group}"
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
            "sources": sources,
        },
    )

    n = len(sources)
    per = max(4.0, target_dur / n)
    framed_clips: list[Path] = []
    titles: list[str] = []
    all_transcript = []

    for i, src in enumerate(sources):
        local = work / f"source_{i}.mp4"
        clip_pipe.fetch_source_file(sb, src, local)
        source_dur = ffprobe_duration(local)
        if source_dur < 3:
            print(f"[CLIPPING] skip source {i}: too short ({source_dur:.1f}s)")
            continue

        seg_target = min(per, source_dur - 0.25) if source_dur > 4 else source_dur
        if n == 1:
            seg_target = min(target_dur, source_dur - 0.1)

        transcript = ""
        words: list = []
        audio_full = work / f"source_{i}_audio.mp3"
        try:
            extracted = clip_pipe.extract_audio(local, audio_full)
            if extracted is None:
                print(f"[CLIPPING] source {i} has no audio; skip transcription")
            else:
                transcript, words = clip_pipe.transcribe_source(
                    extracted, user_id=user_id, job_id=job_id
                )
                if transcript:
                    all_transcript.append(transcript)
        except Exception as exc:
            print(f"[CLIPPING] transcription skipped for source {i}: {exc}")

        start, end, title = clip_pipe.pick_clip_window(
            source_duration=source_dur,
            target_duration=seg_target,
            transcript=transcript,
            instructions=instructions,
            user_id=user_id,
            job_id=job_id,
        )
        clip_len = max(1.0, end - start)
        titles.append(title)
        print(f"[CLIPPING] source {i} window {start:.1f}-{end:.1f}s")

        cut = work / f"cut_{i}.mp4"
        clip_pipe.cut_segment(local, start, clip_len, cut)
        framed = work / f"framed_{i}.mp4"
        clip_pipe.reframe_clip(
            cut, framed, width=out_w, height=out_h, effects=add_effects
        )
        framed_clips.append(framed)

    if not framed_clips:
        raise RuntimeError("No usable source clips (videos too short?)")

    db.update_job(sb, job_id, status="editing")

    combined = work / "combined.mp4"
    if len(framed_clips) == 1:
        combined.write_bytes(framed_clips[0].read_bytes())
    else:
        clip_pipe.concat_av_clips(
            framed_clips,
            combined,
            work_dir=work / "concat",
            use_transitions=add_transitions,
        )

    clip_len = ffprobe_duration(combined)
    title = titles[0] if len(titles) == 1 else (titles[0] if titles else "AI Mix Clip")
    if len(titles) > 1:
        title = "AI Mix Clip"

    music_path = None
    music_attr = None
    if add_music:
        db.update_job(sb, job_id, status="fetching_media")
        try:
            training = merge_optional_training(
                sb,
                user_id,
                {"music_group": music_group},
            )
            mood = "energetic upbeat"
            if instructions and not music_group:
                mood = f"energetic {instructions[:40]}"
            track, music_attr = fetch_background_music(
                sb,
                user_id,
                job_id,
                work / "music",
                training,
                music_group=music_group,
                music_track_id=music_track_id,
                script_mood=mood,
                default_mood=mood,
            )
            if track and track.path:
                music_path = track.path
        except Exception as exc:
            print(f"[CLIPPING] music skipped: {exc}")

    voice_a = work / "clip_voice.aac"
    tts_words: list = []
    if use_voice:
        # Prefer ElevenLabs narration from transcript; fallback to source audio
        narr_text = " ".join(all_transcript).strip()
        if narr_text and voice_id:
            try:
                db.update_job(sb, job_id, status="generating_voice")
                tts_mp3 = work / "tts_voice.mp3"
                tts_words = synthesize_with_timestamps(
                    narr_text[:2500],
                    tts_mp3,
                    voice_id=voice_id,
                )
                # Pad/trim to clip length via mix_audio path later
                voice_a = tts_mp3
                print(f"[CLIPPING] ElevenLabs voice ok ({len(narr_text)} chars)")
            except Exception as exc:
                print(f"[CLIPPING] ElevenLabs failed, using source audio: {exc}")
                clip_pipe.extract_clip_audio(combined, voice_a)
        else:
            clip_pipe.extract_clip_audio(combined, voice_a)
    else:
        # No voice — silent bed for music-only mix
        from orzuvideo.pipeline.media import run_ffmpeg

        run_ffmpeg(
            [
                "-f",
                "lavfi",
                "-i",
                f"anullsrc=r=44100:cl=stereo",
                "-t",
                f"{clip_len:.3f}",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                str(voice_a),
            ]
        )

    mixed_a = work / "mixed.aac"
    if use_voice:
        clip_pipe.mix_clip_music(voice_a, music_path, mixed_a, duration=clip_len)
    elif music_path:
        # Music only (louder bed)
        from orzuvideo.pipeline.editor import mix_audio

        mix_audio(
            voice_a,
            music_path,
            mixed_a,
            voice_duration=clip_len,
            music_volume_hook=0.95,
            music_volume_body=0.88,
            voice_volume=0.05,
        )
    else:
        mixed_a = voice_a

    muxed = work / "muxed.mp4"
    clip_pipe.mux_video_audio(combined, mixed_a, muxed)

    final = work / "clip_final.mp4"
    want_subs = False
    if use_voice:
        try:
            words_for_subs = tts_words
            if not words_for_subs:
                final_audio = work / "final_audio.mp3"
                extracted = clip_pipe.extract_audio(muxed, final_audio)
                if extracted is None:
                    words_for_subs = []
                else:
                    _t, words_for_subs = clip_pipe.transcribe_source(
                        extracted, user_id=user_id, job_id=job_id
                    )
            if words_for_subs and clip_pipe.has_meaningful_speech(
                " ".join(w.word for w in words_for_subs), words_for_subs
            ):
                clip_pipe.burn_subs_keep_audio(
                    muxed,
                    words_for_subs,
                    final,
                    work_dir=work,
                    size=(out_w, out_h),
                )
                want_subs = True
            else:
                final.write_bytes(muxed.read_bytes())
        except Exception as exc:
            print(f"[CLIPPING] captions skipped: {exc}")
            final.write_bytes(muxed.read_bytes())
    else:
        final.write_bytes(muxed.read_bytes())

    db.update_job(sb, job_id, status="uploading")
    stored = upload_preview(sb, user_id=user_id, job_id=job_id, video_path=final)

    # Drop long device source paths from metadata — only the AI clip remains
    cleaned_sources: list[dict] = []
    for src in sources:
        row = dict(src)
        if str(row.get("kind") or "").lower() == "device":
            row["storage_path"] = None
            row["url"] = None
            row["deleted"] = True
        cleaned_sources.append(row)

    meta_done = {
        **meta0,
        "source": "ai_clipping",
        "pipeline": "ai_clipping",
        "publish": False,
        "aspect_ratio": aspect,
        "output_size": [out_w, out_h],
        "duration_seconds": int(round(clip_len)),
        "sources": cleaned_sources,
        "source_url": None,
        "source_storage_path": None,
        "add_subtitles": want_subs,
        "add_music": bool(music_path),
        "add_effects": True,
        "add_transitions": True,
        "use_voice": use_voice,
        "voice_id": voice_id if use_voice else None,
        "music_track_id": music_track_id,
        "music_group": music_group,
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
        script_text=("\n\n".join(all_transcript)[:2000] if all_transcript else None),
        metadata=meta_done,
    )

    # Remove long device source files from R2 — keep only the AI clip
    for src in sources:
        if str(src.get("kind") or "").lower() != "device":
            continue
        sp = str(src.get("storage_path") or "").strip()
        if not sp:
            continue
        try:
            if r2_configured():
                delete_object(sp)
                print(f"[CLIPPING] deleted R2 source {sp}")
        except Exception as exc:
            print(f"[CLIPPING] source cleanup skipped: {exc}")

    # Also wipe any leftover files under clipping/{job_id}/
    try:
        if r2_configured():
            folder = f"{user_id}/clipping/{job_id}"
            n = delete_prefix(folder)
            if n:
                print(f"[CLIPPING] cleared R2 folder {folder} ({n} files)")
    except Exception as exc:
        print(f"[CLIPPING] folder cleanup skipped: {exc}")

    print(f"[CLIPPING] ready job={job_id} url={stored.public_url}")


def _process_reedit_job(job: dict, *, sb, work: Path) -> None:
    """Re-edit an existing ready MP4: trim, look, music mix → new preview."""
    job_id = job["id"]
    user_id = job["user_id"]
    meta0 = _job_meta(job)

    bucket = str(meta0.get("source_storage_bucket") or media_bucket()).strip()
    path = str(meta0.get("source_storage_path") or "").strip()
    url = str(meta0.get("source_preview_url") or "").strip()

    source = work / "source.mp4"
    source.parent.mkdir(parents=True, exist_ok=True)
    if path and r2_configured():
        try:
            download_object(path, source, bucket=bucket if bucket else None)
        except Exception as exc:
            print(f"[REEDIT] R2 download failed: {exc}")
            path = ""
    need_http = (not path) or (not source.exists()) or source.stat().st_size < 1000
    if need_http and url:
        import httpx

        with httpx.Client(timeout=300.0, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            source.write_bytes(r.content)
    if not source.exists() or source.stat().st_size < 1000:
        raise RuntimeError("Re-edit source video missing")

    try:
        trim_start = float(meta0.get("trim_start") or 0)
    except (TypeError, ValueError):
        trim_start = 0.0
    trim_end = meta0.get("trim_end")
    try:
        trim_end_f = float(trim_end) if trim_end is not None else None
    except (TypeError, ValueError):
        trim_end_f = None

    effect = str(meta0.get("effect") or "none").strip()
    motion = str(meta0.get("motion") or "none").strip()
    intro_fade = str(meta0.get("intro_fade") or "none").strip()
    outro_fade = str(meta0.get("outro_fade") or "none").strip()
    overlay_text = str(meta0.get("overlay_text") or "").strip()
    caption_text = str(meta0.get("caption_text") or "").strip()
    text_style = str(meta0.get("text_style") or "bold_center").strip()
    subtitle_style = str(meta0.get("subtitle_style") or "classic").strip()
    preferred_transition = str(meta0.get("preferred_transition") or "fade").strip()
    music_mode = str(meta0.get("music_mode") or "none").strip()
    music_track_id = str(meta0.get("music_track_id") or "").strip() or None
    try:
        music_volume = float(meta0.get("music_volume") or 0.45)
    except (TypeError, ValueError):
        music_volume = 0.45
    keep_original = bool(meta0.get("keep_original_audio", True))

    print(
        f"[REEDIT] job={job_id} effect={effect} motion={motion} "
        f"transition={preferred_transition} music={music_mode} keep_audio={keep_original}"
    )

    db.update_job(sb, job_id, status="editing", metadata={**meta0})

    trimmed = work / "trimmed.mp4"
    reedit_pipe.trim_clip(source, trimmed, start=trim_start, end=trim_end_f)

    looked = work / "look.mp4"
    reedit_pipe.apply_look(
        trimmed,
        looked,
        effect=effect,
        motion=motion,
        intro_fade=intro_fade,
        outro_fade=outro_fade,
    )

    if overlay_text:
        from orzuvideo.pipeline.montage import burn_text_overlay

        titled = work / "titled.mp4"
        burn_text_overlay(looked, titled, overlay_text, style_id=text_style)
        looked = titled

    if caption_text:
        from orzuvideo.pipeline.montage import burn_caption_overlay

        capped = work / "captioned.mp4"
        burn_caption_overlay(
            looked,
            capped,
            caption_text,
            style_id=subtitle_style,
            work_dir=work,
        )
        looked = capped

    clip_len = ffprobe_duration(looked)
    voice_a = work / "voice.aac"
    if keep_original:
        reedit_pipe.extract_or_silence(looked, voice_a)
    else:
        from orzuvideo.pipeline.media import make_silent_audio

        make_silent_audio(voice_a, clip_len)

    music_path = None
    music_attr = None
    if music_mode in ("auto", "track"):
        db.update_job(sb, job_id, status="fetching_media")
        try:
            training = merge_optional_training(sb, user_id, {})
            track, music_attr = fetch_background_music(
                sb,
                user_id,
                job_id,
                work / "music",
                training,
                music_track_id=music_track_id if music_mode == "track" else None,
                default_mood="energetic soundtrack",
            )
            if track and track.path:
                music_path = track.path
        except Exception as exc:
            print(f"[REEDIT] music skipped: {exc}")

    mixed_a = work / "mixed.aac"
    if music_path:
        mix_audio(
            voice_a,
            music_path,
            mixed_a,
            voice_duration=clip_len,
            music_volume_hook=max(0.2, min(1.0, music_volume + 0.1)),
            music_volume_body=max(0.15, min(1.0, music_volume)),
            voice_volume=1.05 if keep_original else 0.05,
        )
    else:
        mixed_a = voice_a

    final = work / "final.mp4"
    reedit_pipe.mux_av(looked, mixed_a, final)

    db.update_job(sb, job_id, status="uploading")
    stored = upload_preview(sb, user_id=user_id, job_id=job_id, video_path=final)

    db.update_job(
        sb,
        job_id,
        status="ready",
        preview_url=stored.public_url,
        video_path=str(final),
        duration_seconds=int(round(clip_len)),
        completed_at=datetime.now(timezone.utc).isoformat(),
        error_message=None,
        metadata={
            **meta0,
            "source": "reedit",
            "pipeline": "reedit",
            "publish": False,
            "music_attribution": music_attr,
            "add_music": bool(music_path),
            **storage_meta(stored),
        },
    )
    print(f"[REEDIT] ready job={job_id} url={stored.public_url}")


def process_job(job: dict) -> None:
    sb = db.get_supabase()
    job_id = job["id"]
    user_id = job["user_id"]
    work = TEMP_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)
    meta0 = _job_meta(job)
    user_brief = (meta0.get("user_brief") or "").strip() or None

    if _is_reedit_job(meta0):
        try:
            _process_reedit_job(job, sb=sb, work=work)
        except Exception as exc:
            db.update_job(
                sb,
                job_id,
                status="failed",
                error_message=f"{exc}\n{traceback.format_exc()[-1500:]}",
            )
            raise
        return

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
                    # Personal creativity videos: up to 5 minutes
                    fixed_dur = max(15, min(300, int(meta0["duration_seconds"])))
                except (TypeError, ValueError):
                    duration_auto = True
                    fixed_dur = None

            aspect, out_w, out_h = _aspect_size(str(meta0.get("aspect_ratio") or "9:16"))
            print(f"[CREATIVITY] render size {out_w}x{out_h} ({aspect})")

            training = merge_optional_training(
                sb,
                user_id,
                {
                    "voice_id": settings.elevenlabs_voice_id,
                    "duration_auto": duration_auto,
                    "duration_seconds": fixed_dur or 30,
                    "music_mood": "cinematic emotional",
                    "pexels_query": "cinematic lifestyle",
                },
            )
            meta0 = {
                **meta0,
                "source": "creativity",
                "pipeline": "creativity",
                "publish": False,
                "aspect_ratio": aspect,
                "output_size": [out_w, out_h],
                "youtube_channel_id": None,
                "used_ai_training": bool(db.get_training(sb, user_id)),
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
                raw_dur = int(script_data["duration_seconds"])
                if is_creativity:
                    chosen = max(15, min(300, raw_dur))
                else:
                    fmt = str(
                        (training or {}).get("video_format")
                        or meta0.get("video_format")
                        or "shorts"
                    )
                    chosen = _clamp_duration(raw_dur, fmt)
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
        used_pexels = exclude_used_media(sb, user_id, "pexels", avoid_days=avoid_days)
        print(f"[MEDIA] pexels exclude={len(used_pexels)} jamendo history tracked per user")

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
                music_prefs = json.loads(music_prefs)
            except Exception:
                music_prefs = {}
        if not isinstance(music_prefs, dict):
            music_prefs = {}

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
        if voice_vol_raw is None:
            voice_vol_raw = music_prefs.get("voice_volume")
        if voice_vol_raw is None:
            voice_vol_raw = montage.get("voice_volume")
        try:
            voice_vol = max(0.5, min(1.4, float(voice_vol_raw if voice_vol_raw is not None else 1.05)))
        except (TypeError, ValueError):
            voice_vol = 1.05

        jamendo, credit = fetch_background_music(
            sb,
            user_id,
            job_id,
            work / "music.mp3",
            training,
            script_mood=str(script_data.get("music_mood") or "").strip() or None,
        )
        if not jamendo or jamendo.path is None or not jamendo.path.exists():
            raise RuntimeError(
                "No music in your library. Open Music → create a genre and upload tracks."
            )
        music_path = jamendo.path
        print(f"Background music ready: {music_path} ({music_path.stat().st_size} bytes)")
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
