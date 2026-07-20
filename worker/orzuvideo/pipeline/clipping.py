"""AI Clipping: long source video → short viral cut with optional subs/music/effects."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from openai import OpenAI

from orzuvideo.config import settings
from orzuvideo.pipeline.editor import mix_audio
from orzuvideo.pipeline.media import (
    WordTiming,
    ffprobe_duration,
    has_audio_stream,
    make_silent_audio,
    run_ffmpeg,
    write_ass_subtitles,
)
from orzuvideo.services.usage import estimate_openai_cost, log_usage


def _escape_ass_path(path: Path) -> str:
    p = path.resolve().as_posix()
    return p.replace(":", "\\:").replace("'", r"\'")


def extract_audio(source: Path, out: Path) -> Path | None:
    """
    Extract mono MP3 for Whisper.
    Returns None when the source has no audio stream (common for silent stock clips).
    """
    if not has_audio_stream(source):
        print(f"[CLIPPING] no audio stream in {source.name}; skip extract")
        return None
    out.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        [
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "4",
            str(out),
        ]
    )
    return out


def transcribe_source(
    audio: Path,
    *,
    user_id: str,
    job_id: str,
) -> tuple[str, list[WordTiming]]:
    """Whisper transcription with word timings when available."""
    client = OpenAI(api_key=settings.openai_api_key)
    with audio.open("rb") as f:
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["word"],
        )

    text = (getattr(result, "text", None) or "").strip()
    words: list[WordTiming] = []
    raw_words = getattr(result, "words", None) or []
    for w in raw_words:
        if isinstance(w, dict):
            token = str(w.get("word") or "").strip()
            start = float(w.get("start") or 0)
            end = float(w.get("end") or start)
        else:
            token = str(getattr(w, "word", "") or "").strip()
            start = float(getattr(w, "start", 0) or 0)
            end = float(getattr(w, "end", start) or start)
        if token:
            words.append(WordTiming(word=token, start=start, end=end))

    # Approximate cost: whisper ~$0.006 / minute
    dur_min = max(0.1, ffprobe_duration(audio) / 60.0)
    log_usage(
        user_id=user_id,
        job_id=job_id,
        provider="openai",
        kind="whisper",
        units=dur_min,
        unit_label="minutes",
        cost_usd=round(dur_min * 0.006, 5),
        meta={"model": "whisper-1"},
    )
    return text, words


def pick_clip_window(
    *,
    source_duration: float,
    target_duration: float,
    transcript: str,
    instructions: str | None,
    user_id: str,
    job_id: str,
) -> tuple[float, float, str]:
    """
    Choose [start, end] for a viral short.
    Returns (start, end, title).
    """
    target = max(8.0, min(float(target_duration), max(8.0, source_duration - 0.5)))
    if source_duration <= target + 0.75:
        return 0.0, source_duration, "AI Clip"

    fallback_start = max(0.0, min(source_duration * 0.12, source_duration - target))
    fallback_end = min(source_duration, fallback_start + target)

    if not (transcript or "").strip() and not (instructions or "").strip():
        return fallback_start, fallback_end, "AI Clip"

    client = OpenAI(api_key=settings.openai_api_key)
    prompt = (
        "You pick the best viral short clip from a longer video.\n"
        f"Source duration seconds: {source_duration:.1f}\n"
        f"Target clip length seconds: {target:.0f}\n"
        f"Optional editor notes: {(instructions or 'none').strip()[:500]}\n\n"
        "Transcript (may be partial):\n"
        f"{(transcript or '(no speech detected)')[:6000]}\n\n"
        "Return ONLY compact JSON:\n"
        '{"start": <seconds>, "title": "<short catchy title max 70 chars>"}\n'
        "Rules: start >= 0, start + target <= source duration, prefer a strong hook."
    )
    try:
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a viral short-form video editor. Reply with JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            response_format={"type": "json_object"},
        )
        usage = response.usage
        if usage:
            log_usage(
                user_id=user_id,
                job_id=job_id,
                provider="openai",
                kind="clip_pick",
                units=(usage.prompt_tokens or 0) + (usage.completion_tokens or 0),
                unit_label="tokens",
                cost_usd=estimate_openai_cost(
                    usage.prompt_tokens or 0, usage.completion_tokens or 0
                ),
                meta={"model": settings.openai_model},
            )
        raw = (response.choices[0].message.content or "").strip()
        data = json.loads(raw)
        start = float(data.get("start") or fallback_start)
        title = str(data.get("title") or "AI Clip").strip()[:70] or "AI Clip"
        start = max(0.0, min(start, source_duration - target))
        return start, start + target, title
    except Exception as exc:
        print(f"[CLIPPING] pick window fallback: {exc}")
        return fallback_start, fallback_end, "AI Clip"


def cut_segment(source: Path, start: float, duration: float, out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    args = [
        "-ss",
        f"{max(0.0, start):.3f}",
        "-i",
        str(source),
        "-t",
        f"{max(1.0, duration):.3f}",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "18",
    ]
    if has_audio_stream(source):
        args.extend(["-c:a", "aac", "-b:a", "192k"])
    else:
        args.append("-an")
    args.extend(["-movflags", "+faststart", str(out)])
    run_ffmpeg(args)
    return out


def reframe_clip(
    source: Path,
    out: Path,
    *,
    width: int,
    height: int,
    effects: bool,
) -> Path:
    """Center-crop / pad to target aspect with optional grade + fades."""
    out.parent.mkdir(parents=True, exist_ok=True)
    base = (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height}"
    )
    if effects:
        try:
            dur = ffprobe_duration(source)
            fade_out = max(0.2, dur - 0.4)
            vf = (
                f"{base},"
                "eq=contrast=1.08:saturation=1.12:brightness=0.02,"
                "vignette=PI/5,"
                "fade=t=in:st=0:d=0.2,"
                f"fade=t=out:st={fade_out:.3f}:d=0.35"
            )
        except Exception:
            vf = f"{base},eq=contrast=1.06:saturation=1.08"
    else:
        vf = base

    args = [
        "-i",
        str(source),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
    ]
    if has_audio_stream(source):
        args.extend(["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)])
        run_ffmpeg(args)
        return out

    # Video-only source → attach silence so later mux/mix never fail
    args = [
        "-i",
        str(source),
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=stereo",
        "-vf",
        vf,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(out),
    ]
    run_ffmpeg(args)
    return out


def extract_clip_audio(video: Path, out: Path) -> Path:
    """Extract AAC from video, or synthesize silence if the clip has no audio."""
    out.parent.mkdir(parents=True, exist_ok=True)
    if not has_audio_stream(video):
        dur = ffprobe_duration(video)
        print(f"[CLIPPING] no audio in {video.name}; using silence ({dur:.1f}s)")
        return make_silent_audio(out, dur)
    run_ffmpeg(
        [
            "-i",
            str(video),
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(out),
        ]
    )
    return out


def words_in_window(
    words: list[WordTiming],
    start: float,
    end: float,
) -> list[WordTiming]:
    out: list[WordTiming] = []
    for w in words:
        if w.end < start or w.start > end:
            continue
        out.append(
            WordTiming(
                word=w.word,
                start=max(0.0, w.start - start),
                end=max(0.05, min(end - start, w.end - start)),
            )
        )
    return out


def burn_subs_keep_audio(
    video: Path,
    words: list[WordTiming],
    out: Path,
    *,
    work_dir: Path,
    size: tuple[int, int],
) -> Path:
    if not words:
        if out.resolve() != video.resolve():
            out.write_bytes(video.read_bytes())
        return out

    ass = write_ass_subtitles(
        words,
        work_dir / "clip_subs.ass",
        play_res=size,
    )
    ass_esc = _escape_ass_path(ass)
    run_ffmpeg(
        [
            "-i",
            str(video),
            "-vf",
            f"ass='{ass_esc}'",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "19",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
            str(out),
        ]
    )
    return out


def mux_video_audio(video: Path, audio: Path, out: Path) -> Path:
    run_ffmpeg(
        [
            "-i",
            str(video),
            "-i",
            str(audio),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-movflags",
            "+faststart",
            str(out),
        ]
    )
    return out


def has_meaningful_speech(transcript: str, words: list[WordTiming]) -> bool:
    tokens = re.findall(r"[A-Za-zА-Яа-яЁё0-9]{2,}", transcript or "")
    if len(tokens) >= 8:
        return True
    return len(words) >= 12


def concat_av_clips(
    clips: list[Path],
    out: Path,
    *,
    work_dir: Path,
    use_transitions: bool = True,
) -> Path:
    """Join AV clips with optional xfade / acrossfade, else hard concat."""
    from orzuvideo.pipeline.montage import concat_with_pro_transitions, pick_transition

    if len(clips) == 1:
        out.write_bytes(clips[0].read_bytes())
        return out

    work_dir.mkdir(parents=True, exist_ok=True)

    if not use_transitions:
        # demuxer concat (re-encode for safety)
        list_file = work_dir / "concat.txt"
        list_file.write_text(
            "".join(f"file '{c.resolve().as_posix()}'\n" for c in clips),
            encoding="utf-8",
        )
        run_ffmpeg(
            [
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_file),
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "19",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                str(out),
            ]
        )
        return out

    # Video xfade + audio acrossfade
    durations = [ffprobe_duration(c) for c in clips]
    overlap = 0.45
    inputs: list[str] = []
    for c in clips:
        inputs.extend(["-i", str(c)])

    v_filters: list[str] = []
    a_filters: list[str] = []
    offset = max(0.05, durations[0] - overlap)
    prev_v = "[0:v]"
    prev_a = "[0:a]"
    last_tr: str | None = None

    for i in range(1, len(clips)):
        tr = pick_transition(exclude=last_tr)
        last_tr = tr
        dur = min(overlap, 0.6)
        v_out = f"[v{i}]" if i < len(clips) - 1 else "[vout]"
        a_out = f"[a{i}]" if i < len(clips) - 1 else "[aout]"
        v_filters.append(
            f"{prev_v}[{i}:v]xfade=transition={tr}:duration={dur:.3f}:offset={offset:.3f}{v_out}"
        )
        a_filters.append(
            f"{prev_a}[{i}:a]acrossfade=d={dur:.3f}:c1=tri:c2=tri{a_out}"
        )
        prev_v = v_out
        prev_a = a_out
        if i < len(clips) - 1:
            offset += durations[i] - dur

    # Fallback if audio missing on some clips: video-only then silent
    try:
        run_ffmpeg(
            [
                *inputs,
                "-filter_complex",
                ";".join(v_filters + a_filters),
                "-map",
                "[vout]",
                "-map",
                "[aout]",
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "19",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                str(out),
            ]
        )
    except Exception as exc:
        print(f"[CLIPPING] AV xfade failed ({exc}); video-only concat")
        vid_only = work_dir / "vout_only.mp4"
        concat_with_pro_transitions(clips, vid_only, overlap=overlap)
        # mix first clip audio loop length
        audio = work_dir / "a0.aac"
        extract_clip_audio(clips[0], audio)
        mux_video_audio(vid_only, audio, out)
    return out


def fetch_source_file(
    sb: Any,
    src: dict,
    dest: Path,
) -> Path:
    """Prefer Storage download; fall back to HTTP URL."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    bucket = str(src.get("storage_bucket") or "short-previews").strip()
    path = str(src.get("storage_path") or "").strip()
    if path:
        try:
            data = sb.storage.from_(bucket).download(path)
            dest.write_bytes(data)
            if dest.stat().st_size > 1000:
                return dest
        except Exception as exc:
            print(f"[CLIPPING] storage download failed {bucket}/{path}: {exc}")

    url = str(src.get("url") or "").strip()
    if not url:
        raise RuntimeError("Source missing storage_path and url")

    import httpx

    with httpx.Client(timeout=300.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest


def mix_clip_music(
    voice_audio: Path,
    music: Path | None,
    out: Path,
    *,
    duration: float,
) -> Path:
    return mix_audio(
        voice_audio,
        music,
        out,
        voice_duration=duration,
        music_volume_hook=0.42,
        music_volume_body=0.28,
        voice_volume=1.08,
    )

