from __future__ import annotations

from pathlib import Path

from orzuvideo.config import settings
from orzuvideo.pipeline.media import (
    WordTiming,
    ffprobe_duration,
    run_ffmpeg,
    write_ass_subtitles,
)
from orzuvideo.pipeline.montage import (
    concat_with_pro_transitions,
    normalize_clip_pro,
    pick_motion,
)


def _escape_ass_path(path: Path) -> str:
    p = path.resolve().as_posix()
    return p.replace(":", "\\:").replace("'", r"\'")


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

    fade_out_at = max(0.5, voice_duration - 1.4)
    filter_complex = (
        f"[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,"
        f"loudnorm=I=-16:TP=-1.5:LRA=11,"
        f"volume='if(lt(t,2.8),0.72,0.42)':eval=frame,"
        f"afade=t=in:st=0:d=0.15,"
        f"afade=t=out:st={fade_out_at:.3f}:d=1.3[bg];"
        f"[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,"
        f"loudnorm=I=-14:TP=-1.5:LRA=11,volume=1.05[vox];"
        f"[vox][bg]amix=inputs=2:duration=first:dropout_transition=2:normalize=0,"
        f"loudnorm=I=-13:TP=-1.2:LRA=11[aout]"
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

    # Subtle film grade + vignette after captions
    vf = (
        f"ass='{ass_esc}',"
        "vignette=PI/5.5,"
        "eq=contrast=1.05:saturation=1.06:gamma=0.98"
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
            "17",
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
    """Pro Shorts assembly: punch open, motion library, cinematic transitions."""
    work_dir.mkdir(parents=True, exist_ok=True)
    voice_dur = ffprobe_duration(voice_path)

    n = max(1, len(clips))
    overlap = 0.55 if n > 1 else 0.0
    hook_dur = min(3.0, max(2.4, voice_dur * 0.12))
    rest_budget = max(0.5, voice_dur - hook_dur + overlap * max(0, n - 1))
    rest_n = max(1, n - 1)
    per_rest = rest_budget / rest_n

    used_motions: set[str] = set()
    normalized: list[Path] = []
    for i, clip in enumerate(clips):
        dst = work_dir / f"norm_{i}.mp4"
        dur = hook_dur if i == 0 else per_rest
        punch = i == 0
        motion = pick_motion(punch=punch)
        # Prefer unique motions across body clips
        if not punch:
            tries = 0
            while motion["id"] in used_motions and tries < 6:
                motion = pick_motion(punch=False)
                tries += 1
            used_motions.add(motion["id"])
        print(f"Clip {i} motion: {motion['id']} ({dur:.2f}s)")
        normalize_clip_pro(clip, dst, dur, punch=punch, motion=motion)
        normalized.append(dst)

    timeline = work_dir / "timeline.mp4"
    concat_with_pro_transitions(
        normalized,
        timeline,
        overlap=overlap if n > 1 else 0.0,
    )

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
