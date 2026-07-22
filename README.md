# OrzuAi

MVP: Next.js on Vercel + Supabase + a Python worker with FFmpeg.
On a schedule (or on demand), AI writes a script (GPT-4o-mini), synthesizes voice (ElevenLabs),
downloads footage (Pexels), edits a 9:16 Short with karaoke captions, and uploads to YouTube.

## Architecture

```
web/          Next.js (Vercel) — auth, YouTube OAuth, AI training, cron
worker/       Python + FFmpeg — edit and publish
supabase/     SQL schema
```

Flow:

1. Sign up with email (Supabase Auth)
2. Connect YouTube
3. AI Training — set niche / style / voice / music once
4. Enable schedule → Vercel Cron inserts jobs into `video_jobs`
5. Worker claims job → script → TTS → Pexels → FFmpeg → YouTube Shorts

## 1. Supabase

1. Create a project on [supabase.com](https://supabase.com)
2. SQL Editor → run migrations in order:
   - `supabase/migrations/001_*.sql` …
   - …remaining migrations by number…
   - `supabase/migrations/010_creativity_storage.sql` — `short-previews` bucket for Creativity
   - `supabase/migrations/012_music_prefs_thumbs.sql` — music prefs + thumbnails
   - `supabase/migrations/013_cleanup_instagram_rename_avatar.sql` — drop Instagram junk (if not already)
   - `supabase/migrations/015_drop_avatar_heygen.sql` — remove Avatar / HeyGen tables
3. Authentication → Providers → Email: enable
4. Copy URL, anon key, and service_role key

Finished videos live in **Cloudflare R2** (not Supabase Storage). See [`STORAGE.md`](STORAGE.md).
Domain / Google / Vercel checklist: [`DOMAIN.md`](DOMAIN.md) (`https://orzuai.com`).

| What | Where |
|------|--------|
| MP4 file | R2 bucket → `{user_id}/{job_id}.mp4` |
| Link | `video_jobs.preview_url` + `storage_path` |
| View | `/api/jobs/[id]/preview` (signed R2 URL) |

Supabase keeps **auth + Postgres only**. The worker does **not** mark status `ready` until R2 upload succeeds.

## 2. API keys

| Service | Purpose |
|---------|---------|
| OpenAI (`gpt-4o-mini`) | Shorts script |
| ElevenLabs | Voice + caption timings |
| Pexels | Background video (portrait) |
| Jamendo | Background instrumental music (`client_id`) |

## 3. Web (Vercel)

1. Google Cloud Console → new project (YouTube Data API + OAuth)
2. Copy `web/.env.example` → `web/.env.local` and fill keys
3. On Vercel, add the same env vars + `CRON_SECRET`
4. `vercel.json` already schedules cron: daily 08:00 UTC → `/api/cron/daily`

```bash
cd web
npm install
npm run dev
```

## 4. Worker

Requires **FFmpeg** on PATH.

```bash
cd worker
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
# fill worker/.env (same Supabase service role)
python main.py
```

Optional: put a royalty-free mp3 in `worker/assets/music/` as a fallback bed.

Docker (Railway / any VPS):

```bash
cd worker
docker build -t orzuvideo-worker .
docker run --env-file .env orzuvideo-worker
```

## 5. How to use

1. Open the site → Sign up
2. Connect YouTube
3. AI Training → Save (required: Language, Voice, Music, Niche, Script style)
4. Enable AI content on Channel **or** create a Short from Publications
5. Keep the worker running — job status updates through to Published / Ready

## Editing (worker)

Professional pipeline without MoviePy (more stable on servers):

- 3 Pexels clips with zoom + fade + xfade
- Karaoke captions
- Loudnorm voice + quieter music with fade
- Upload as a public Short

## Notes

- FFmpeg does **not** run on Vercel serverless — the worker runs separately (Railway / VPS / local).
- YouTube refresh tokens need `prompt=consent` (already enabled).
- Free ElevenLabs plans have a monthly character limit.
- Instagram and Avatar / HeyGen were removed from the product.
