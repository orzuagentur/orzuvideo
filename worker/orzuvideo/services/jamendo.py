"""Deprecated Jamendo module — music now comes from the user's R2 library.

Kept as a thin re-export so old imports do not break during deploy.
"""

from orzuvideo.services.media_pick import LibraryTrack as JamendoTrack
from orzuvideo.services.media_pick import attribution_line

__all__ = ["JamendoTrack", "attribution_line"]
