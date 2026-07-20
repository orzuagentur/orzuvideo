from __future__ import annotations

import random
from pathlib import Path

from orzuvideo.config import settings
from orzuvideo.pipeline.media import ffprobe_duration, run_ffmpeg

# Professional Shorts transition library (ffmpeg xfade names)
TRANSITION_LIBRARY: list[str] = [
    "fade",
    "fadeblack",
    "fadewhite",
    "distance",
    "wipeleft",
    "wiperight",
    "wipeup",
    "wipedown",
    "slideleft",
    "slideright",
    "slideup",
    "slidedown",
    "smoothleft",
    "smoothright",
    "smoothup",
    "smoothdown",
    "circlecrop",
    "rectcrop",
    "circleopen",
    "circleclose",
    "vertopen",
    "vertclose",
    "horzopen",
    "horzclose",
    "diagtl",
    "diagtr",
    "diagbl",
    "diagbr",
    "hlslice",
    "hrslice",
    "vuslice",
    "vdslice",
    "radial",
    "pixelize",
    "dissolve",
    "hblur",
]

# Motion / animation presets applied per clip (Ken Burns style)
MOTION_PRESETS: list[dict[str, str]] = [
    {
        "id": "punch_in",
        "zoom": "min(zoom+0.0028,1.28)",
        "x": "iw/2-(iw/zoom/2)",
        "y": "ih/2-(ih/zoom/2)",
        "eq": "eq=contrast=1.14:saturation=1.22:brightness=0.04",
    },
    {
        "id": "slow_push",
        "zoom": "min(zoom+0.0012,1.18)",
        "x": "iw/2-(iw/zoom/2)",
        "y": "ih/2-(ih/zoom/2)",
        "eq": "eq=contrast=1.06:saturation=1.1:brightness=0.02",
    },
    {
        "id": "rise",
        "zoom": "min(zoom+0.0015,1.2)",
        "x": "iw/2-(iw/zoom/2)",
        "y": "ih*0.52-(ih/zoom/2)-on*0.35",
        "eq": "eq=contrast=1.08:saturation=1.12:brightness=0.025",
    },
    {
        "id": "drift_left",
        "zoom": "min(1.12+0.0004*on,1.2)",
        "x": "iw/2-(iw/zoom/2)-on*0.55",
        "y": "ih/2-(ih/zoom/2)",
        "eq": "eq=contrast=1.07:saturation=1.1:brightness=0.02",
    },
    {
        "id": "drift_right",
        "zoom": "min(1.12+0.0004*on,1.2)",
        "x": "iw/2-(iw/zoom/2)+on*0.55",
        "y": "ih/2-(ih/zoom/2)",
        "eq": "eq=contrast=1.07:saturation=1.1:brightness=0.02",
    },
    {
        "id": "snap_zoom",
        "zoom": "if(lt(on,8),1.35-on*0.02,min(zoom+0.0009,1.16))",
        "x": "iw/2-(iw/zoom/2)",
        "y": "ih/2-(ih/zoom/2)",
        "eq": "eq=contrast=1.16:saturation=1.25:brightness=0.05",
    },
]


def pick_transition(exclude: str | None = None) -> str:
    pool = [t for t in TRANSITION_LIBRARY if t != exclude] or TRANSITION_LIBRARY
    return random.choice(pool)


def pick_motion(*, punch: bool = False) -> dict[str, str]:
    if punch:
        return next(m for m in MOTION_PRESETS if m["id"] == "punch_in")
    # Avoid repeating punch_in for body clips
    body = [m for m in MOTION_PRESETS if m["id"] != "punch_in"]
    return random.choice(body)


def normalize_clip_pro(
    src: Path,
    dst: Path,
    duration: float,
    *,
    punch: bool = False,
    motion: dict[str, str] | None = None,
    size: tuple[int, int] | None = None,
) -> Path:
    """Normalize clip to target frame with cinematic motion + grade."""
    w, h = size or (settings.output_width, settings.output_height)
    fps = settings.fps
    motion = motion or pick_motion(punch=punch)
    zoom = (
        f"zoompan=z='{motion['zoom']}':d=1:"
        f"x='{motion['x']}':y='{motion['y']}':s={w}x{h}:fps={fps},"
    )
    fade_in = 0.12 if punch else 0.18
    fade_out = 0.28
    vf = (
        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
        f"crop={w}:{h},"
        f"{zoom}"
        f"{motion['eq']},"
        f"fade=t=in:st=0:d={fade_in},"
        f"fade=t=out:st={max(0.1, duration - fade_out):.3f}:d={fade_out}"
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
            "19",
            "-pix_fmt",
            "yuv420p",
            str(dst),
        ]
    )
    return dst


def concat_with_pro_transitions(
    clips: list[Path],
    out: Path,
    *,
    overlap: float = 0.55,
) -> Path:
    """Crossfade clips with varied cinematic transitions from the library."""
    if len(clips) == 1:
        import shutil

        shutil.copy(clips[0], out)
        return out

    durations = [ffprobe_duration(c) for c in clips]
    inputs: list[str] = []
    for c in clips:
        inputs.extend(["-i", str(c)])

    filters: list[str] = []
    offset = max(0.05, durations[0] - overlap)
    prev = "[0:v]"
    last_transition: str | None = None

    for i in range(1, len(clips)):
        transition = pick_transition(exclude=last_transition)
        last_transition = transition
        # Keep transitions snappy for Shorts
        dur = min(overlap, max(0.35, min(durations[i], durations[i - 1]) * 0.25))
        dur = min(dur, 0.7)
        out_label = f"[v{i}]" if i < len(clips) - 1 else "[vout]"
        print(f"Montage transition {i}: {transition} ({dur:.2f}s @ offset {offset:.2f})")
        filters.append(
            f"{prev}[{i}:v]xfade=transition={transition}:duration={dur:.3f}:offset={offset:.3f}{out_label}"
        )
        prev = out_label
        if i < len(clips) - 1:
            offset += durations[i] - dur

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
            str(settings.fps),
            str(out),
        ]
    )
    return out
