"""Publish Reels via Instagram Graph API (Business account)."""

from __future__ import annotations

import time
from typing import Any

import httpx

GRAPH = "https://graph.facebook.com/v21.0"


def publish_reel(
    *,
    ig_user_id: str,
    access_token: str,
    video_url: str,
    caption: str,
) -> dict[str, str]:
    """
    1) Create REELS container
    2) Poll until FINISHED
    3) media_publish
    """
    if not ig_user_id or not access_token:
        raise RuntimeError("Instagram account token / ig_user_id missing")
    if not video_url.startswith("http"):
        raise RuntimeError("Instagram requires a public https video_url")

    with httpx.Client(timeout=120.0) as client:
        create = client.post(
            f"{GRAPH}/{ig_user_id}/media",
            data={
                "media_type": "REELS",
                "video_url": video_url,
                "caption": caption[:2200],
                "share_to_feed": "true",
                "access_token": access_token,
            },
        )
        created = create.json()
        if create.status_code >= 400 or not created.get("id"):
            raise RuntimeError(f"IG container create failed: {created}")

        container_id = str(created["id"])
        print(f"IG container: {container_id}")

        # Poll processing
        status = "IN_PROGRESS"
        deadline = time.time() + 600
        while time.time() < deadline:
            st = client.get(
                f"{GRAPH}/{container_id}",
                params={
                    "fields": "status_code,status",
                    "access_token": access_token,
                },
            )
            body = st.json()
            status = str(body.get("status_code") or body.get("status") or "")
            print(f"IG container status={status}")
            if status == "FINISHED":
                break
            if status in ("ERROR", "EXPIRED"):
                raise RuntimeError(f"IG container failed: {body}")
            time.sleep(5.0)
        else:
            raise RuntimeError(f"IG container timed out (last={status})")

        pub = client.post(
            f"{GRAPH}/{ig_user_id}/media_publish",
            data={
                "creation_id": container_id,
                "access_token": access_token,
            },
        )
        published = pub.json()
        if pub.status_code >= 400 or not published.get("id"):
            raise RuntimeError(f"IG publish failed: {published}")

        media_id = str(published["id"])
        permalink = ""
        try:
            meta = client.get(
                f"{GRAPH}/{media_id}",
                params={
                    "fields": "permalink,shortcode",
                    "access_token": access_token,
                },
            ).json()
            permalink = str(meta.get("permalink") or "")
        except Exception:
            pass

        return {
            "instagram_media_id": media_id,
            "instagram_permalink": permalink
            or f"https://www.instagram.com/reel/{media_id}/",
        }


def token_for_publish(account: dict[str, Any]) -> str:
    """Prefer page token for IG content publish."""
    return (
        (account.get("page_access_token") or account.get("access_token") or "").strip()
    )
