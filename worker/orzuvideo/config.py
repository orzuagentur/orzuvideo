from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
# Always load worker/.env with override so keys from this file win
load_dotenv(ROOT / ".env", override=True)
load_dotenv(override=False)

TEMP_DIR = Path(os.getenv("TEMP_DIR", ROOT / "temp"))
ASSETS_DIR = Path(os.getenv("ASSETS_DIR", ROOT / "assets"))
TEMP_DIR.mkdir(parents=True, exist_ok=True)
(ASSETS_DIR / "fonts").mkdir(parents=True, exist_ok=True)
(ASSETS_DIR / "music").mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class Settings:
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    elevenlabs_api_key: str = os.getenv("ELEVENLABS_API_KEY", "")
    elevenlabs_voice_id: str = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    pexels_api_key: str = os.getenv("PEXELS_API_KEY", "")
    jamendo_client_id: str = os.getenv("JAMENDO_CLIENT_ID", "")
    youtube_client_id: str = os.getenv("YOUTUBE_CLIENT_ID", "")
    youtube_client_secret: str = os.getenv("YOUTUBE_CLIENT_SECRET", "")
    poll_interval_sec: float = float(os.getenv("POLL_INTERVAL_SEC", "15"))
    output_width: int = 1080
    output_height: int = 1920
    fps: int = 30


settings = Settings()
