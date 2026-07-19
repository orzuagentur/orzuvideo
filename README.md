# OrzuVideo

Простой MVP: сайт на Vercel + Supabase + Python-воркер с FFmpeg.
Раз в день (или по кнопке) ИИ пишет сценарий (GPT-4o-mini), голос (ElevenLabs),
скачивает футаж (Pexels), монтирует Short 9:16 с karaoke-субтитрами и заливает на YouTube.

## Архитектура

```
web/          Next.js (Vercel) — регистрация, YouTube OAuth, AI training, cron
worker/       Python + FFmpeg — монтаж и публикация
supabase/     SQL схема
```

Поток:

1. Регистрация email (Supabase Auth)
2. Connect YouTube (Google OAuth, offline refresh token)
3. AI Training — один раз описываешь нишу / стиль / Pexels-запрос
4. Enable daily → Vercel Cron создаёт 2 job'а в `video_jobs`
5. Worker забирает job → script → TTS → Pexels → FFmpeg edit → YouTube Shorts

## 1. Supabase

1. Создай проект на [supabase.com](https://supabase.com)
2. SQL Editor → выполни `supabase/migrations/001_initial.sql`
3. Authentication → Providers → Email: включи
4. Скопируй URL, anon key, service_role key

## 2. API ключи

| Сервис | Зачем |
|--------|--------|
| OpenAI (`gpt-4o-mini`) | Сценарий Shorts |
| ElevenLabs | Голос + тайминги субтитров |
| Pexels | Фоновые видео (портрет) |
| Google Cloud YouTube Data API v3 | OAuth + upload |

### Google / YouTube

1. Google Cloud Console → новый проект
2. Enable **YouTube Data API v3**
3. OAuth consent screen (External) → scopes: `youtube.upload`, `youtube.readonly`
4. Credentials → OAuth Client ID (Web)
5. Authorized redirect URI:
   - local: `http://localhost:3000/api/youtube/callback`
   - prod: `https://YOUR_DOMAIN/api/youtube/callback`

## 3. Web (Vercel)

```bash
cd web
cp .env.example .env.local
# заполни ключи
npm install
npm run dev
```

На Vercel добавь те же env + `CRON_SECRET`.
`vercel.json` уже ставит cron: каждый день 08:00 UTC → `/api/cron/daily`.

## 4. Worker (Python)

Нужен **FFmpeg** в PATH.

```bash
cd worker
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# заполни ключи (тот же SUPABASE service role)
python main.py
```

Опционально: положи royalty-free mp3 в `worker/assets/music/` — подложится как фон.

Docker (Railway / любой VPS):

```bash
cd worker
docker build -t orzuvideo-worker .
docker run --env-file .env orzuvideo-worker
```

## 5. Как пользоваться

1. Открой сайт → Sign up
2. Dashboard → Connect YouTube
3. AI training → сохрани промпт (пример уже есть)
4. Enable daily **или** Generate 1 Short now
5. Worker должен быть запущен — статус job обновится до Published

## Монтаж (worker)

Профессиональный пайплайн без MoviePy (стабильнее на сервере):

- 1080×1920, 30fps
- 3 Pexels-клипа с zoom + fade + xfade
- ElevenLabs with-timestamps → ASS karaoke
- loudnorm голоса + тихая музыка с fade
- vignette + color grade
- upload как публичный Short

## Важно

- FFmpeg **не** живёт на Vercel serverless — воркер отдельно (Railway / VPS / локально).
- YouTube refresh token выдаётся только при `prompt=consent` (уже включено).
- На бесплатном ElevenLabs есть лимит символов/месяц.
