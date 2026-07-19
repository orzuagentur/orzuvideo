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


def run_ffmpeg(args: list[str]) -> None:
    cmd = ["ffmpeg", "-y", *args]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{proc.stderr[-2000:]}")


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
) -> Path:
    """Professional karaoke ASS + optional 3-second hook headline."""
    emphasis_set = {e.upper().strip(".,!") for e in (emphasis or [])}
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,78,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,0,2,60,60,520,1
Style: Emphasis,Arial Black,86,&H0000E5FF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,0,2,60,60,520,1
Style: Hook,Arial Black,92,&H0000E5FF,&H000000FF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,8,0,2,50,50,780,1

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

    # Giant hook text for first 3 seconds (pattern interrupt)
    if hook_text:
        clean_hook = re.sub(r"\s+", " ", hook_text).strip()[:72]
        lines.append(
            f"Dialogue: 1,{ts(0.05)},{ts(2.95)},Hook,,0,0,0,,{{\\fad(120,180)\\fscx108\\fscy108}}{clean_hook}\n"
        )

    # Group into chunks of 3–4 words for readability
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
