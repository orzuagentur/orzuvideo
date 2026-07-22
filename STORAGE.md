# Where files live (OrzuVideo)

## Supabase (Postgres + Auth only)

Keep here:

- User accounts / sessions (`auth.users`)
- Profiles, YouTube channels, OAuth tokens
- AI Training settings
- Job rows (`video_jobs`) — status, title, script, **paths/URLs only**
- Favorites bookmarks (`media_favorites`) — external Pexels/Jamendo links
- Usage / billing metadata
- Schedules, worker presence

Do **not** store MP4 / music / large binaries in Supabase Storage anymore.

---

## Cloudflare R2 (all large files)

Bucket name: `R2_BUCKET` (default `orzu-media`)

Public base: `R2_PUBLIC_BASE_URL` (custom domain or `*.r2.dev`)

| Asset | Object key |
|-------|------------|
| Finished Creativity / Clipping / Re-edit video | `{user_id}/{job_id}.mp4` |
| Cover thumbnail | `{user_id}/{job_id}_thumb.jpg` |
| AI Clipping device sources (temp) | `{user_id}/clipping/{job_id}/source_{i}.mp4` |
| Device → YouTube upload | `{user_id}/{job_id}.mp4` |

DB still stores:

- `video_jobs.storage_path` → R2 object key
- `video_jobs.storage_bucket` → R2 bucket name
- `video_jobs.preview_url` / `thumbnail_url` → public CDN URL under `R2_PUBLIC_BASE_URL`

Playback: `/api/jobs/[id]/preview` issues a **signed R2 GET** (works even if the bucket is private).

Browser uploads (clipping sources): `/api/storage/presign` → direct **PUT** to R2.

Worker (Railway) uploads finished MP4s with boto3 → R2.

---

## External CDNs (not our storage)

| Source | What |
|--------|------|
| Pexels | Stock video / photos (Media section) |
| Jamendo | Stock music previews (Media / worker bed) |
| YouTube | Published videos after upload |
| ElevenLabs | TTS generated into worker temp only |

---

## Worker temp disk (Railway / local)

`worker/temp/{job_id}/` — intermediate ffmpeg / TTS / downloads. Deleted with the job folder; never the source of truth.

---

## Env checklist

**Web (Vercel) + Worker (Railway)** both need the same R2 vars:

```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET=orzu-media
R2_PUBLIC_BASE_URL=https://media.orzuai.com
```

Optional: `R2_ENDPOINT`, `R2_REGION=auto`

### Cloudflare dashboard setup

1. Create R2 bucket `orzu-media`
2. Create API token (Object Read & Write)
3. Custom domain: `media.orzuai.com` → set as `R2_PUBLIC_BASE_URL`
4. CORS for browser PUT (clipping uploads):

```json
[
  {
    "AllowedOrigins": [
      "https://www.orzuai.com",
      "https://orzuai.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Type", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

Full domain checklist: see [`DOMAIN.md`](DOMAIN.md).
---

## Migration note

Old objects in Supabase bucket `short-previews` are **not** auto-copied. New jobs go to R2. To migrate old library videos, copy objects to the same keys in R2 and keep `storage_path` unchanged (or re-generate).
