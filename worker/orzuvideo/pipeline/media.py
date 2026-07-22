from __future__ import annotations

import json
import math
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

import httpx

from orzuvideo.config import settings


@dataclass
class WordTiming:
    word: str
    start: float
    end: float


def ffprobe_duration(path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(path),
    ]
    out = subprocess.check_output(cmd, text=True)
    data = json.loads(out)
    return float(data["format"]["duration"])


def has_audio_stream(path: Path) -> bool:
    """True if the media file has at least one audio stream."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "csv=p=0",
        str(path),
    ]
    try:
        out = subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT).strip()
        return bool(out)
    except Exception:
        return False


def make_silent_audio(
    out: Path,
    duration: float,
    *,
    sample_rate: int = 44100,
) -> Path:
    """Generate a silent AAC bed (for video-only sources)."""
    out.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        [
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=r={sample_rate}:cl=stereo",
            "-t",
            f"{max(0.1, float(duration)):.3f}",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            str(out),
        ]
    )
    return out


def _ffmpeg_error_tip(stderr: str, stdout: str) -> str:
    """Drop the huge configure banner; keep the real failure lines."""
    blob = (stderr or "") + "\n" + (stdout or "")
    lines = [ln.strip() for ln in blob.splitlines() if ln.strip()]
    useful: list[str] = []
    for ln in lines:
        low = ln.lower()
        if low.startswith("configuration:"):
            continue
        if " --enable-" in ln and ln.count("--enable-") >= 3:
            continue
        if low.startswith("libav") or low.startswith("built with"):
            continue
        useful.append(ln)
    picked = useful[-16:] if useful else lines[-8:]
    return "\n".join(picked) if picked else "(no ffmpeg stderr)"


def run_ffmpeg(args: list[str]) -> None:
    # hide_banner + error loglevel → short, readable failures (not the configure dump)
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        tip = _ffmpeg_error_tip(proc.stderr or "", proc.stdout or "")
        raise RuntimeError(f"ffmpeg failed (code {proc.returncode}):\n{tip}")


def synthesize_with_timestamps(
    text: str,
    out_mp3: Path,
    voice_id: str | None = None,
) -> list[WordTiming]:
    """ElevenLabs TTS with character alignment → word timings."""
    vid = voice_id or settings.elevenlabs_voice_id
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/with-timestamps"
    headers = {
        "xi-api-key": settings.elevenlabs_api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.8,
            "style": 0.35,
            "use_speaker_boost": True,
        },
    }

    with httpx.Client(timeout=120.0) as client:
        resp = client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    import base64

    audio_b64 = data["audio_base64"]
    out_mp3.parent.mkdir(parents=True, exist_ok=True)
    out_mp3.write_bytes(base64.b64decode(audio_b64))

    alignment = data.get("alignment") or {}
    chars = alignment.get("characters") or []
    starts = alignment.get("character_start_times_seconds") or []
    ends = alignment.get("character_end_times_seconds") or []

    if not chars or not starts:
        return estimate_word_timings(text, ffprobe_duration(out_mp3))

    return chars_to_words(chars, starts, ends)


def chars_to_words(
    chars: list[str],
    starts: list[float],
    ends: list[float],
) -> list[WordTiming]:
    words: list[WordTiming] = []
    buf = ""
    w_start: float | None = None
    w_end = 0.0

    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace() or ch in ".,!?;:":
            if buf.strip():
                words.append(WordTiming(buf.strip(), w_start or s, w_end or e))
            buf = ""
            w_start = None
            continue
        if w_start is None:
            w_start = s
        buf += ch
        w_end = e

    if buf.strip():
        words.append(WordTiming(buf.strip(), w_start or 0.0, w_end))
    return words


def estimate_word_timings(text: str, duration: float) -> list[WordTiming]:
    tokens = re.findall(r"\S+", text)
    if not tokens:
        return []
    weights = [max(1, len(re.sub(r"\W", "", t))) for t in tokens]
    total = sum(weights)
    t = 0.0
    out: list[WordTiming] = []
    for token, w in zip(tokens, weights):
        span = duration * (w / total)
        out.append(WordTiming(token, t, t + span))
        t += span
    return out


def write_ass_subtitles(
    words: list[WordTiming],
    ass_path: Path,
    *,
    emphasis: list[str] | None = None,
    hook_text: str | None = None,
    play_res: tuple[int, int] | None = None,
    style_id: str = "classic",
) -> Path:
    """Professional karaoke ASS + optional hook; CapCut-like subtitle styles."""
    from orzuvideo.pipeline.fx_library import SUBTITLE_STYLES

    emphasis_set = {e.upper().strip(".,!") for e in (emphasis or [])}
    play_w, play_h = play_res or (1080, 1920)
    margin_v = max(80, int(play_h * 0.27))
    hook_margin_v = max(120, int(play_h * 0.4))
    st = SUBTITLE_STYLES.get(style_id) or SUBTITLE_STYLES["classic"]
    gold = SUBTITLE_STYLES.get("karaoke_gold") or st
    hook = SUBTITLE_STYLES.get("hook_banner") or st
    border_style = st.get("border_style", "1")
    back = st.get("back", "&H80000000")
    align = st.get("align", "2")

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {play_w}
PlayResY: {play_h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{st['font']},{st['size']},{st['primary']},&H000000FF,{st['outline']},{back},{st['bold']},0,0,0,100,100,0,0,{border_style},{st['outline_w']},{st['shadow']},{align},60,60,{margin_v},1
Style: Emphasis,{gold['font']},{gold['size']},{gold['primary']},&H000000FF,{gold['outline']},&H80000000,{gold['bold']},0,0,0,100,100,0,0,1,{gold['outline_w']},0,2,60,60,{margin_v},1
Style: Hook,{hook['font']},{hook['size']},{hook['primary']},&H000000FF,{hook['outline']},&HA0000000,{hook['bold']},0,0,0,100,100,0,0,1,{hook['outline_w']},0,2,50,50,{hook_margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    def ts(sec: float) -> str:
        sec = max(0.0, sec)
        h = int(sec // 3600)
        m = int((sec % 3600) // 60)
        s = int(sec % 60)
        cs = int(round((sec - math.floor(sec)) * 100))
        if cs >= 100:
            cs = 0
            s += 1
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    lines = [header]

    if hook_text:
        clean_hook = re.sub(r"\s+", " ", hook_text).strip()[:72]
        lines.append(
            f"Dialogue: 1,{ts(0.05)},{ts(2.95)},Hook,,0,0,0,,{{\\fad(120,180)\\fscx108\\fscy108}}{clean_hook}\n"
        )

    i = 0
    while i < len(words):
        chunk = words[i : i + 3]
        if not chunk:
            break
        start = chunk[0].start
        end = chunk[-1].end + 0.08
        parts: list[str] = []
        for w in chunk:
            clean = w.word.strip(".,!?;:")
            style_tag = r"{\c&H00E5FF&\fscx110\fscy110}" if clean.upper() in emphasis_set else ""
            reset = r"{\r}" if style_tag else ""
            parts.append(
                rf"{{\t({int(w.start*1000)},{int(w.end*1000)},\fscx120\fscy120)}}"
                f"{style_tag}{w.word}{reset}"
            )
        text = " ".join(parts)
        lines.append(f"Dialogue: 0,{ts(start)},{ts(end)},Default,,0,0,0,,{text}\n")
        i += 3

    ass_path.write_text("".join(lines), encoding="utf-8")
    return ass_path
