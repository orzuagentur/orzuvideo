from __future__ import annotations

import random
from pathlib import Path

from orzuvideo.config import settings
from orzuvideo.pipeline.fx_library import (
    MOTION_PRESETS,
    TRANSITION_LIBRARY,
    effect_chain,
    motion_by_id,
)
from orzuvideo.pipeline.media import ffprobe_duration, run_ffmpeg

# Re-export for older imports
__all__ = [
    "TRANSITION_LIBRARY",
    "MOTION_PRESETS",
    "pick_transition",
    "pick_motion",
    "normalize_clip_pro",
    "concat_with_pro_transitions",
    "make_still_clip",
    "burn_text_overlay",
    "burn_caption_overlay",
]


def pick_transition(exclude: str | None = None) -> str:
    pool = [t for t in TRANSITION_LIBRARY if t != exclude] or list(TRANSITION_LIBRARY)
    return random.choice(pool)


def pick_motion(*, punch: bool = False) -> dict[str, str]:
    if punch:
        return next(m for m in MOTION_PRESETS if m["id"] == "punch_in")
    body = [m for m in MOTION_PRESETS if m["id"] != "punch_in"]
    return random.choice(body)


def _tb_chain(*, fps: int | None = None) -> str:
    """Force identical CFR timebase so chained xfade never mismatches."""
    f = int(fps or settings.fps)
    # N/(fps*TB) rebuilds PTS on a shared clock after fps/settb.
    return (
        f"fps={f}:round=up,format=yuv420p,"
        f"settb=expr=1/{f},setpts=N/({f}*TB)"
    )


def _relock_label(label: str, *, fps: int, out: str) -> str:
    """Re-lock timebase after an xfade output before the next transition."""
    return (
        f"{label}fps={fps}:round=up,format=yuv420p,"
        f"settb=expr=1/{fps},setpts=N/({fps}*TB){out}"
    )


def normalize_clip_pro(
    src: Path,
    dst: Path,
    duration: float,
    *,
    punch: bool = False,
    motion: dict[str, str] | None = None,
    size: tuple[int, int] | None = None,
    effect: str | None = None,
) -> Path:
    """Normalize clip to target frame with cinematic motion + grade + locked timebase."""
    w, h = size or (settings.output_width, settings.output_height)
    fps = settings.fps
    motion = motion or pick_motion(punch=punch)
    zoom = (
        f"zoompan=z='{motion['zoom']}':d=1:"
        f"x='{motion['x']}':y='{motion['y']}':s={w}x{h}:fps={fps},"
    )
    fade_in = 0.12 if punch else 0.18
    fade_out = 0.28
    grade = effect_chain(effect) if effect else motion.get("eq") or ""
    grade_part = f"{grade}," if grade else ""
    vf = (
        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
        f"crop={w}:{h},"
        f"{zoom}"
        f"{grade_part}"
        f"fade=t=in:st=0:d={fade_in},"
        f"fade=t=out:st={max(0.1, duration - fade_out):.3f}:d={fade_out},"
        f"{_tb_chain(fps=fps)}"
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
            "-vsync",
            "cfr",
            "-video_track_timescale",
            str(max(fps * 1000, 30000)),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "19",
            "-pix_fmt",
            "yuv420p",
            str(dst),
        ]
    )
    return dst


def make_still_clip(
    src: Path,
    dst: Path,
    duration: float,
    *,
    size: tuple[int, int] | None = None,
    motion_id: str = "slow_push",
    effect: str = "cinematic",
) -> Path:
    """Photo/still → Ken Burns video clip (CapCut-style photo motion)."""
    w, h = size or (settings.output_width, settings.output_height)
    fps = settings.fps
    motion = motion_by_id(motion_id) or pick_motion(punch=False)
    grade = effect_chain(effect)
    grade_part = f"{grade}," if grade else ""
    vf = (
        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
        f"crop={w}:{h},"
        f"zoompan=z='{motion['zoom']}':d=1:"
        f"x='{motion['x']}':y='{motion['y']}':s={w}x{h}:fps={fps},"
        f"{grade_part}"
        f"{_tb_chain(fps=fps)}"
    )
    run_ffmpeg(
        [
            "-loop",
            "1",
            "-i",
            str(src),
            "-t",
            f"{max(0.5, duration):.3f}",
            "-vf",
            vf,
            "-r",
            str(fps),
            "-vsync",
            "cfr",
            "-video_track_timescale",
            str(max(fps * 1000, 30000)),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(dst),
        ]
    )
    return dst


def burn_text_overlay(
    src: Path,
    dst: Path,
    text: str,
    *,
    style_id: str = "bold_center",
) -> Path:
    from orzuvideo.pipeline.fx_library import TEXT_STYLES

    style = TEXT_STYLES.get(style_id) or TEXT_STYLES["bold_center"]
    safe = (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", r"\'")
        .replace("%", "%%")
    )[:120]
    parts = [
        f"drawtext=text='{safe}'",
        f"fontsize={style['fontsize']}",
        f"fontcolor={style['fontcolor']}",
        f"x={style['x']}",
        f"y={style['y']}",
    ]
    if style.get("borderw"):
        parts.append(f"borderw={style['borderw']}")
        parts.append(f"bordercolor={style.get('bordercolor', 'black')}")
    if style.get("box") == "1":
        parts.append("box=1")
        parts.append(f"boxcolor={style.get('boxcolor', 'black@0.5')}")
        if style.get("boxborderw"):
            parts.append(f"boxborderw={style['boxborderw']}")
    vf = f"{','.join(parts)},{_tb_chain()}"
    run_ffmpeg(
        [
            "-i",
            str(src),
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "19",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            "-r",
            str(settings.fps),
            str(dst),
        ]
    )
    return dst


def burn_caption_overlay(
    src: Path,
    dst: Path,
    text: str,
    *,
    style_id: str = "classic",
    work_dir: Path | None = None,
) -> Path:
    """Burn a full-duration caption using ASS subtitle styles from the CapCut library."""
    from orzuvideo.pipeline.media import WordTiming, write_ass_subtitles

    dur = max(0.5, ffprobe_duration(src))
    words = [WordTiming(w, 0.05, dur - 0.05) for w in text.strip().split()[:24]] or [
        WordTiming(text[:80], 0.05, dur - 0.05)
    ]
    wd = work_dir or dst.parent
    wd.mkdir(parents=True, exist_ok=True)
    ass = write_ass_subtitles(
        words,
        wd / "caption_overlay.ass",
        style_id=style_id,
        play_res=(settings.output_width, settings.output_height),
    )
    p = ass.resolve().as_posix().replace(":", "\\:").replace("'", r"\'")
    run_ffmpeg(
        [
            "-i",
            str(src),
            "-vf",
            f"ass='{p}',{_tb_chain()}",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "19",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            "-r",
            str(settings.fps),
            str(dst),
        ]
    )
    return dst


def concat_with_pro_transitions(
    clips: list[Path],
    out: Path,
    *,
    overlap: float = 0.55,
    size: tuple[int, int] | None = None,
) -> Path:
    """Crossfade clips with locked timebases + varied cinematic transitions."""
    if len(clips) == 1:
        import shutil

        shutil.copy(clips[0], out)
        return out

    w, h = size or (settings.output_width, settings.output_height)
    fps = settings.fps
    durations = [ffprobe_duration(c) for c in clips]
    inputs: list[str] = []
    for c in clips:
        inputs.extend(["-i", str(c)])

    # Normalize every input to identical fps/timebase/size before xfade
    prep: list[str] = []
    for i in range(len(clips)):
        prep.append(
            f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h},{_tb_chain(fps=fps)}[p{i}]"
        )

    filters: list[str] = list(prep)
    offset = max(0.05, durations[0] - overlap)
    prev = "[p0]"
    last_transition: str | None = None

    for i in range(1, len(clips)):
        transition = pick_transition(exclude=last_transition)
        last_transition = transition
        dur = min(overlap, max(0.35, min(durations[i], durations[i - 1]) * 0.25))
        dur = min(dur, 0.7)
        raw_out = f"[vx{i}]"
        print(f"Montage transition {i}: {transition} ({dur:.2f}s @ offset {offset:.2f})")
        filters.append(
            f"{prev}[p{i}]xfade=transition={transition}:duration={dur:.3f}:offset={offset:.3f}{raw_out}"
        )
        if i < len(clips) - 1:
            locked = f"[p{i}x]"
            filters.append(_relock_label(raw_out, fps=fps, out=locked))
            prev = locked
            offset += durations[i] - dur
        else:
            # Final output — lock once more so encoder sees clean CFR
            filters.append(_relock_label(raw_out, fps=fps, out="[vout]"))

    try:
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
                "19",
                "-pix_fmt",
                "yuv420p",
                "-r",
                str(fps),
                "-vsync",
                "cfr",
                "-video_track_timescale",
                str(max(fps * 1000, 30000)),
                str(out),
            ]
        )
    except Exception as exc:
        # Fallback: hard concat demuxer if an exotic xfade name is unsupported
        print(f"[MONTAGE] xfade failed ({exc}); hard concat fallback")
        _hard_concat(clips, out)
    return out


def _hard_concat(clips: list[Path], out: Path) -> Path:
    list_file = out.parent / f"{out.stem}_concat.txt"
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
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(settings.fps),
            "-vsync",
            "cfr",
            str(out),
        ]
    )
    return out
