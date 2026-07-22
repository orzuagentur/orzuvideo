# Domain setup — orzuai.com

Canonical app: **https://orzuai.com**  
Media CDN (R2): **https://media.orzuai.com**  
WWW: **https://www.orzuai.com** → redirect to apex

---

## 1) Vercel (web app)

**Project → Settings → Domains**

Add:
- `orzuai.com`
- `www.orzuai.com` (redirect to `orzuai.com`)

DNS (Cloudflare or registrar) → point to Vercel as Vercel shows (A / CNAME).

**Project → Settings → Environment Variables** (Production):

```
NEXT_PUBLIC_APP_URL=https://orzuai.com
YOUTUBE_REDIRECT_URI=https://orzuai.com/api/youtube/callback
R2_PUBLIC_BASE_URL=https://media.orzuai.com
R2_BUCKET=orzu-media
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_ENDPOINT=https://{ACCOUNT_ID}.r2.cloudflarestorage.com
R2_REGION=auto
```

Also copy all other keys (Supabase, OpenAI, ElevenLabs, Pexels, Jamendo, YouTube client id/secret, CRON_SECRET).

Redeploy after saving env.

---

## 2) Google Cloud (YouTube OAuth)

**Console:** [Google Cloud Console](https://console.cloud.google.com/)  
→ APIs & Services → Credentials → your **OAuth 2.0 Client ID** (Web application)

### Authorized JavaScript origins

```
https://orzuai.com
https://www.orzuai.com
http://localhost:3000
```

### Authorized redirect URIs

```
https://orzuai.com/api/youtube/callback
https://www.orzuai.com/api/youtube/callback
http://localhost:3000/api/youtube/callback
```

Save. Wait 1–5 minutes.

**OAuth consent screen** (if not done):
- App name: `OrzuAi`
- User support email: your email
- Authorized domains: `orzuai.com` (and `orzuvideo.vercel.app` if still used)
- Application home page: `https://orzuai.com`
- Privacy policy: `https://orzuai.com/privacy`
- Terms of service: `https://orzuai.com/terms`
- Scopes: YouTube upload / readonly / force-ssl (already requested in code)

---

## 3) Supabase Auth

**Dashboard → Authentication → URL Configuration**

| Field | Value |
|-------|--------|
| Site URL | `https://orzuai.com` |
| Redirect URLs | `https://orzuai.com/**` |
| | `https://www.orzuai.com/**` |
| | `http://localhost:3000/**` |

---

## 4) Cloudflare R2 — media.orzuai.com

1. R2 → bucket `orzu-media` → **Settings → Custom Domains**  
   Connect: `media.orzuai.com`
2. DNS: Cloudflare creates CNAME for `media` → R2 (proxied OK)

### CORS (R2 bucket → Settings → CORS)

Paste:

```json
[
  {
    "AllowedOrigins": [
      "https://orzuai.com",
      "https://www.orzuai.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Type", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

Env (Vercel + Railway worker):

```
R2_PUBLIC_BASE_URL=https://media.orzuai.com
```

---

## 5) Railway (Python worker)

Same R2 + Supabase vars as production. Worker does **not** need `NEXT_PUBLIC_APP_URL` / YouTube redirect (web handles OAuth).

---

## 6) Local `.env.local` (dev only)

Keep localhost so Google OAuth works on your PC:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/youtube/callback
R2_PUBLIC_BASE_URL=https://media.orzuai.com
```

Production URLs live in **Vercel env**, not in `.env.local`.

---

## Quick copy list

| Куда | Что вставить |
|------|----------------|
| Vercel Domains | `orzuai.com`, `www.orzuai.com` |
| Vercel env `NEXT_PUBLIC_APP_URL` | `https://orzuai.com` |
| Vercel env `YOUTUBE_REDIRECT_URI` | `https://orzuai.com/api/youtube/callback` |
| Vercel + Railway `R2_PUBLIC_BASE_URL` | `https://media.orzuai.com` |
| Google → Origins | `https://orzuai.com` |
| Google → Redirect | `https://orzuai.com/api/youtube/callback` |
| Supabase Site URL | `https://orzuai.com` |
| Cloudflare R2 custom domain | `media.orzuai.com` |

---

## Check after deploy

1. Open https://orzuai.com → login works  
2. Connect YouTube → returns to `/dashboard/channel` (not error)  
3. Create Creativity / Clipping video → plays from `media.orzuai.com` or signed preview  
4. Upload from device for clipping → R2 PUT succeeds (CORS OK)
