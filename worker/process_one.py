#!/usr/bin/env python3
"""Process a single queued job then exit (useful for debugging)."""

from orzuvideo.runner import process_next_job

if __name__ == "__main__":
    ok = process_next_job()
    print("processed" if ok else "no queued jobs")
