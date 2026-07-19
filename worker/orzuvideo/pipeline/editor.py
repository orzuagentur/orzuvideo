from __future__ import annotations

import shutil
from pathlib import Path

from orzuvideo.config import settings
from orzuvideo.pipeline.media import (
    WordTiming,
    ffprobe_duration,
    run_ffmpeg,
    write_ass_subtitles,
)


def _escape_ass_path(path: Path) -> str:
    # ffmpeg on Windows needs escaped drive colon and forward slashes for filter
    p = path.resolve().as_posix()
    return p.replace(":", "\\:").replace("'", r"\'")


def normalize_clip(
    src: Path,
    dst: Path,
    duration: float,
    *,
    punch: bool = False,
) -> Path:
    """Scale/crop to 1080x1920, trim/loop to target duration, zoom."""
    w, h, fps = settings.output_width, settings.output_height, settings.fps
    zoom = (
        f"zoompan=z='min(zoom+0.0022,1.22)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={fps},"
        if punch
        else f"zoompan=z='min(zoom+0.0008,1.12)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={fps},"
    )
    color = (
        "eq=contrast=1.12:saturation=1.18:brightness=0.03,"
        if punch
        else "eq=contrast=1.05:saturation=1.08:brightness=0.02,"
    )
    vf = (
        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
        f"crop={w}:{h},"
        f"{zoom}"
        f"{color}"
        f"fade=t=in:st=0:d=0.2,fade=t=out:st={max(0.1, duration-0.35)}:d=0.35"
    )
    run_ffmpeg(
        [
            "-stream_loop",
            "-1",
            "-i",
            str(src),
            "-t",
            f"{duration:.3f}",
            "-an",
            "-vf",
            vf,
            "-r",
            str(fps),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            str(dst),
        ]
    )
    return dst


def concat_with_xfade(clips: list[Path], out: Path, overlap: float = 0.45) -> Path:
    """Crossfade multiple vertical clips into one timeline."""
    if len(clips) == 1:
        shutil.copy(clips[0], out)
        return out

    durations = [ffprobe_duration(c) for c in clips]
    # Build filter_complex xfade chain
    inputs: list[str] = []
    for c in clips:
        inputs.extend(["-i", str(c)])

    filters: list[str] = []
    # offset accumulates: d0 + d1 - overlap + ...
    offset = durations[0] - overlap
    prev = "[0:v]"
    for i in range(1, len(clips)):
        out_label = f"[v{i}]" if i < len(clips) - 1 else "[vout]"
        filters.append(
            f"{prev}[{i}:v]xfade=transition=fade:duration={overlap}:offset={offset:.3f}{out_label}"
        )
        prev = out_label
        if i < len(clips) - 1:
            offset += durations[i] - overlap

    run_ffmpeg(
        [
            *inputs,
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[vout]",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(settings.fps),
            str(out),
        ]
    )
    return out


def mix_audio(
    voice: Path,
    music: Path | None,
    out: Path,
    *,
    voice_duration: float,
) -> Path:
    if music is None or not music.exists():
        run_ffmpeg(
            [
                "-i",
                str(voice),
                "-af",
                "loudnorm=I=-14:TP=-1.5:LRA=11",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                str(out),
            ]
        )
        return out

    # Louder bed in first 1.5s (hook), then duck under voice
    filter_complex = (
        f"[1:a]volume=0.22,afade=t=in:st=0:d=0.25,"
        f"volume='if(lt(t,1.5),1.35,0.55)':eval=frame,"
        f"afade=t=out:st={max(0.5, voice_duration-1.2)}:d=1.2[bg];"
        f"[0:a]loudnorm=I=-14:TP=-1.5:LRA=11[vox];"
        f"[vox][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]"
    )
    run_ffmpeg(
        [
            "-i",
            str(voice),
            "-stream_loop",
            "-1",
            "-i",
            str(music),
            "-filter_complex",
            filter_complex,
            "-map",
            "[aout]",
            "-t",
            f"{voice_duration:.3f}",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(out),
        ]
    )
    return out


def burn_subtitles_and_mux(
    video: Path,
    audio: Path,
    words: list[WordTiming],
    out: Path,
    *,
    emphasis: list[str] | None = None,
    hook_text: str | None = None,
    work_dir: Path,
) -> Path:
    ass = write_ass_subtitles(
        words,
        work_dir / "subs.ass",
        emphasis=emphasis,
        hook_text=hook_text,
    )
    ass_esc = _escape_ass_path(ass)

    vf = (
        f"ass='{ass_esc}',"
        "vignette=PI/5,"
        "eq=contrast=1.04:saturation=1.05"
    )

    duration = ffprobe_duration(audio)
    run_ffmpeg(
        [
            "-i",
            str(video),
            "-i",
            str(audio),
            "-t",
            f"{duration:.3f}",
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
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


def build_short(
    *,
    clips: list[Path],
    voice_path: Path,
    music_path: Path | None,
    words: list[WordTiming],
    work_dir: Path,
    output_path: Path,
    emphasis: list[str] | None = None,
    hook_text: str | None = None,
) -> Path:
    """Full professional Shorts assembly with a 3-second punchy open."""
    work_dir.mkdir(parents=True, exist_ok=True)
    voice_dur = ffprobe_duration(voice_path)

    # First clip = pattern interrupt (~3s), remaining time split across rest
    n = max(1, len(clips))
    overlap = 0.4 if n > 1 else 0.0
    hook_dur = min(3.0, max(2.4, voice_dur * 0.12))
    rest_budget = max(0.5, voice_dur - hook_dur + overlap * max(0, n - 1))
    rest_n = max(1, n - 1)
    per_rest = rest_budget / rest_n

    normalized: list[Path] = []
    for i, clip in enumerate(clips):
        dst = work_dir / f"norm_{i}.mp4"
        dur = hook_dur if i == 0 else per_rest
        normalize_clip(clip, dst, dur, punch=(i == 0))
        normalized.append(dst)

    timeline = work_dir / "timeline.mp4"
    concat_with_xfade(normalized, timeline, overlap=overlap if n > 1 else 0.0)

    tl_dur = ffprobe_duration(timeline)
    if tl_dur < voice_dur - 0.05:
        padded = work_dir / "timeline_pad.mp4"
        run_ffmpeg(
            [
                "-stream_loop",
                "-1",
                "-i",
                str(timeline),
                "-t",
                f"{voice_dur:.3f}",
                "-c",
                "copy",
                str(padded),
            ]
        )
        timeline = padded

    mixed = work_dir / "mixed.m4a"
    mix_audio(voice_path, music_path, mixed, voice_duration=voice_dur)

    return burn_subtitles_and_mux(
        timeline,
        mixed,
        words,
        output_path,
        emphasis=emphasis,
        hook_text=hook_text,
        work_dir=work_dir,
    )
