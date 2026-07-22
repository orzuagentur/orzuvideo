from __future__ import annotations

from pathlib import Path

from orzuvideo.config import settings
from orzuvideo.pipeline.fx_library import (
    EFFECT_FILTERS,
    FADE_BOOKENDS,
    MOTION_PRESETS,
    effect_chain,
    motion_by_id,
)
from orzuvideo.pipeline.media import (
    ffprobe_duration,
    has_audio_stream,
    make_silent_audio,
    run_ffmpeg,
)

# Back-compat aliases
MOTION_BY_ID = {m["id"]: m for m in MOTION_PRESETS}


def trim_clip(
    source: Path,
    out: Path,
    *,
    start: float,
    end: float | None,
) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    dur = ffprobe_duration(source)
    ss = max(0.0, min(float(start), max(0.0, dur - 0.5)))
    if end is not None and end > ss + 0.4:
        length = min(float(end) - ss, dur - ss)
    else:
        length = max(0.5, dur - ss)

    fps = settings.fps
    args = [
        "-ss",
        f"{ss:.3f}",
        "-i",
        str(source),
        "-t",
        f"{length:.3f}",
        "-vf",
        f"fps={fps},format=yuv420p,settb=1/{fps},setpts=PTS-STARTPTS",
        "-r",
        str(fps),
        "-vsync",
        "cfr",
        "-video_track_timescale",
        str(fps),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
    ]
    if has_audio_stream(source):
        args.extend(["-c:a", "aac", "-b:a", "192k"])
    else:
        args.append("-an")
    args.extend(["-movflags", "+faststart", str(out)])
    run_ffmpeg(args)
    return out


def apply_look(
    source: Path,
    out: Path,
    *,
    effect: str,
    motion: str,
    intro_fade: str,
    outro_fade: str,
) -> Path:
    """Apply grade / optional Ken Burns / bookend fades in one encode."""
    out.parent.mkdir(parents=True, exist_ok=True)
    dur = ffprobe_duration(source)
    fps = settings.fps
    w, h = settings.output_width, settings.output_height
    parts: list[str] = []

    motion_p = motion_by_id(motion) if motion and motion != "none" else None
    if motion_p:
        parts.append(
            f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
        )
        parts.append(
            f"zoompan=z='{motion_p['zoom']}':x='{motion_p['x']}':y='{motion_p['y']}'"
            f":d=1:s={w}x{h}:fps={fps}"
        )
        if motion_p.get("eq"):
            parts.append(motion_p["eq"])
        # Layer selected grade on top of motion grade when both set
        ef = effect_chain(effect)
        if ef and effect not in ("none", ""):
            parts.append(ef)
    else:
        ef = effect_chain(effect)
        if ef:
            parts.append(ef)

    fade_in = 0.35 if intro_fade and intro_fade != "none" else 0.0
    fade_out = 0.45 if outro_fade and outro_fade != "none" else 0.0
    if fade_in > 0:
        color = "white" if intro_fade == "fadewhite" else "black"
        parts.append(f"fade=t=in:st=0:d={fade_in:.2f}:color={color}")
    if fade_out > 0:
        st = max(0.1, dur - fade_out)
        color = "white" if outro_fade == "fadewhite" else "black"
        parts.append(f"fade=t=out:st={st:.3f}:d={fade_out:.2f}:color={color}")

    parts.append(f"fps={fps},format=yuv420p,settb=1/{fps},setpts=PTS-STARTPTS")

    vf = ",".join(parts)
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
        "-r",
        str(fps),
        "-vsync",
        "cfr",
        "-video_track_timescale",
        str(fps),
    ]
    if has_audio_stream(source):
        args.extend(["-c:a", "aac", "-b:a", "192k"])
    else:
        args.append("-an")
    args.extend(["-movflags", "+faststart", str(out)])
    run_ffmpeg(args)
    return out


def extract_or_silence(video: Path, out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    if not has_audio_stream(video):
        return make_silent_audio(out, ffprobe_duration(video))
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


def mux_av(video: Path, audio: Path, out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
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


# Keep for API validation / docs
KNOWN_EFFECTS = set(EFFECT_FILTERS.keys())
KNOWN_MOTIONS = {"none", *[m["id"] for m in MOTION_PRESETS]}
KNOWN_FADES = set(FADE_BOOKENDS)
