from __future__ import annotations

from pathlib import Path

from orzuvideo.pipeline.media import (
    ffprobe_duration,
    has_audio_stream,
    make_silent_audio,
    run_ffmpeg,
)
from orzuvideo.pipeline.montage import MOTION_PRESETS

EFFECT_FILTERS: dict[str, str] = {
    "none": "",
    "cinematic": "eq=contrast=1.08:saturation=1.12:brightness=0.02,vignette=PI/5.5",
    "vivid": "eq=contrast=1.14:saturation=1.28:brightness=0.03",
    "soft": "eq=contrast=0.96:saturation=0.92:brightness=0.04:gamma=1.05",
    "noir": "hue=s=0,eq=contrast=1.2:brightness=-0.02",
    "punch": "eq=contrast=1.18:saturation=1.22:brightness=0.05",
    "vignette": "vignette=PI/4.5,eq=contrast=1.06:saturation=1.08",
}

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

    args = [
        "-ss",
        f"{ss:.3f}",
        "-i",
        str(source),
        "-t",
        f"{length:.3f}",
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
    parts: list[str] = []

    motion_p = MOTION_BY_ID.get(motion) if motion and motion != "none" else None
    if motion_p:
        parts.append(
            "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
        )
        parts.append(
            f"zoompan=z='{motion_p['zoom']}':x='{motion_p['x']}':y='{motion_p['y']}'"
            f":d=1:s=1080x1920:fps=30"
        )
        if motion_p.get("eq"):
            parts.append(motion_p["eq"])
    else:
        ef = EFFECT_FILTERS.get(effect or "none", "")
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

    if not parts:
        args = [
            "-i",
            str(source),
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
