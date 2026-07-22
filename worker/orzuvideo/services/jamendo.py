"""Background music from the platform R2 library (genres + tracks)."""

from __future__ import annotations

# Re-export library picker for older imports
from orzuvideo.services.media_pick import (  # noqa: F401
    LibraryTrack,
    attribution_line,
    fetch_background_music,
    pick_library_track,
)

__all__ = [
    "LibraryTrack",
    "attribution_line",
    "fetch_background_music",
    "pick_library_track",
]
