from __future__ import annotations

import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from orzuvideo.config import TEMP_DIR, settings
from orzuvideo.pipeline.media import synthesize_with_timestamps
from orzuvideo.services import db
from orzuvideo.services.heygen import heygen_configured, render_avatar_reel
from orzuvideo.services.instagram_publish import publish_reel, token_for_publish
from orzuvideo.services.scriptgen import generate_script
from orzuvideo.services.storage import upload_audio, upload_preview
from orzuvideo.services.usage import estimate_elevenlabs_cost, log_usage


def _meta(job: dict[str, Any]) -> dict[str, Any]:
    m = job.get("metadata") or {}
    return m if isinstance(m, dict) else {}


def _as_youtube_shaped_training(ig: dict[str, Any]) -> dict[str, Any]:
    """Reuse Shorts scriptgen with Instagram training fields."""
    return {
        "duration_seconds": ig.get("duration_seconds") or 30,
        "language": ig.get("language") or "en",
        "video_format": "reels",
        "video_style": "talking_head",
        "niche": ig.get("niche"),
        "content_type": ig.get("content_type"),
        "tone": ig.get("tone"),
        "target_audience": ig.get("target_audience"),
        "hook_style": ig.get("hook_style"),
        "cta": ig.get("cta"),
        "brand_rules": ig.get("brand_rules"),
        "style_prompt": ig.get("style_prompt"),
        "pexels_query": "cinematic portrait talking",
        "music_mood": ig.get("music_mood") or "upbeat",
    }


def process_instagram_job(job: dict[str, Any]) -> None:
    sb = db.get_supabase()
    job_id = job["id"]
    user_id = job["user_id"]
    work = TEMP_DIR / f"ig_{job_id}"
    work.mkdir(parents=True, exist_ok=True)
    meta0 = _meta(job)
    publish = bool(meta0.get("publish", False))
    user_brief = (meta0.get("user_brief") or "").strip() or None

    try:
        training = db.get_instagram_training(sb, user_id)
        if not training:
            raise RuntimeError("Instagram AI training missing. Train in Instagram studio.")

        avatar_id = (training.get("heygen_avatar_id") or settings.heygen_avatar_id or "").strip()
        if not avatar_id:
            raise RuntimeError("HeyGen avatar_id missing (Instagram → Avatar).")
        if not heygen_configured():
            raise RuntimeError("HEYGEN_API_KEY missing in worker/.env")

        account = db.get_instagram_account(sb, user_id) if publish or meta0.get("publish_existing") else None

        # Publish-only path
        if meta0.get("publish_existing") and job.get("preview_url"):
            if not account:
                raise RuntimeError("Instagram is not connected.")
            db.update_ig_job(sb, job_id, status="uploading")
            result = publish_reel(
                ig_user_id=str(account["ig_user_id"]),
                access_token=token_for_publish(account),
                video_url=str(job["preview_url"]),
                caption=str(job.get("caption") or job.get("title") or ""),
            )
            db.update_ig_job(
                sb,
                job_id,
                status="published",
                instagram_media_id=result["instagram_media_id"],
                instagram_permalink=result["instagram_permalink"],
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
            log_usage(
                user_id=user_id,
                job_id=job_id,
                provider="other",
                kind="instagram_publish",
                units=1,
                unit_label="actions",
                cost_usd=0,
                meta=result,
            )
            return

        # 1) Script
        db.update_ig_job(sb, job_id, status="generating_script")
        script_data = generate_script(
            _as_youtube_shaped_training(training),
            user_id=user_id,
            job_id=job_id,
            user_brief=user_brief,
        )
        caption = script_data.get("description") or script_data["script"]
        db.update_ig_job(
            sb,
            job_id,
            script_text=script_data["script"],
            title=script_data["title"],
            caption=caption,
            tags=script_data.get("tags") or [],
            metadata={**meta0, "hook": script_data.get("hook")},
        )

        # 2) Voice
        db.update_ig_job(sb, job_id, status="generating_voice")
        voice_path = work / "voice.mp3"
        synthesize_with_timestamps(
            script_data["script"],
            voice_path,
            voice_id=training.get("voice_id") or settings.elevenlabs_voice_id,
        )
        chars = len(script_data["script"])
        log_usage(
            user_id=user_id,
            job_id=job_id,
            provider="elevenlabs",
            kind="tts",
            units=chars,
            unit_label="chars",
            cost_usd=estimate_elevenlabs_cost(chars),
            meta={"platform": "instagram"},
        )

        audio_url = upload_audio(sb, user_id=user_id, job_id=job_id, audio_path=voice_path)
        print(f"Public audio for HeyGen: {audio_url}")

        # 3) HeyGen avatar
        db.update_ig_job(sb, job_id, status="generating_avatar")
        out_video = work / "reel_avatar.mp4"
        render_avatar_reel(
            avatar_id=avatar_id,
            audio_url=audio_url,
            dest=out_video,
            title=script_data["title"],
        )
        db.update_ig_job(sb, job_id, video_path=str(out_video), voice_path=str(voice_path))

        # 4) Preview storage (required for IG publish URL)
        db.update_ig_job(sb, job_id, status="editing")
        preview_url = upload_preview(
            sb, user_id=user_id, job_id=f"ig_{job_id}", video_path=out_video
        )
        db.update_ig_job(sb, job_id, preview_url=preview_url)
        print(f"IG preview: {preview_url}")

        # Estimate HeyGen cost ~$0.05/sec for ~duration (logged as other)
        dur = int(training.get("duration_seconds") or 30)
        log_usage(
            user_id=user_id,
            job_id=job_id,
            provider="other",
            kind="heygen_avatar",
            units=dur,
            unit_label="seconds",
            cost_usd=round(dur * 0.05, 4),
            meta={"platform": "instagram", "avatar_id": avatar_id},
        )

        if not publish:
            db.update_ig_job(
                sb,
                job_id,
                status="ready",
                completed_at=datetime.now(timezone.utc).isoformat(),
                metadata={**meta0, "preview_uploaded": True, "publish": False},
            )
            print(f"IG draft ready: {job_id}")
            return

        if not account:
            account = db.get_instagram_account(sb, user_id)
        if not account:
            raise RuntimeError("Instagram is not connected.")

        db.update_ig_job(sb, job_id, status="uploading")
        result = publish_reel(
            ig_user_id=str(account["ig_user_id"]),
            access_token=token_for_publish(account),
            video_url=preview_url,
            caption=caption,
        )
        db.update_ig_job(
            sb,
            job_id,
            status="published",
            instagram_media_id=result["instagram_media_id"],
            instagram_permalink=result["instagram_permalink"],
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        log_usage(
            user_id=user_id,
            job_id=job_id,
            provider="other",
            kind="instagram_publish",
            units=1,
            unit_label="actions",
            cost_usd=0,
            meta=result,
        )
        print(f"IG published: {result}")
    except Exception as exc:
        db.update_ig_job(
            sb,
            job_id,
            status="failed",
            error_message=f"{exc}\n{traceback.format_exc()[-1500:]}",
        )
        raise
