# Domain setup — orzuai.com / www.orzuai.com

**Canonical (tags, env, OAuth consent links):** `https://www.orzuai.com`  
**Also allowed everywhere:** `https://orzuai.com` (apex — do not block)  
Media CDN (R2): `https://media.orzuai.com`

Rule: use **one** primary URL in env/metadata (`www`), but **whitelist both** hosts in Google, Supabase, R2 CORS, and Vercel Domains so neither is blocked.

---

## 1) Vercel (web app)

**Project → Settings → Domains** — add **both** (both Valid, neither blocked):

- `www.orzuai.com`
- `orzuai.com`

DNS (Cloudflare) — both must resolve:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `www` | `cname.vercel-dns.com` | Proxied |
| CNAME | `@` | `cname.vercel-dns.com` | Proxied |

(If apex CNAME is rejected, use A `@` → `76.76.21.21`.)

**Project → Settings → Environment Variables** (Production) — single primary:

```
NEXT_PUBLIC_APP_URL=https://www.orzuai.com
YOUTUBE_REDIRECT_URI=https://www.orzuai.com/api/youtube/callback
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

### Google OAuth verification (prefer www; apex must also work if used)

Consent screen (same address everywhere):

```
https://www.orzuai.com
https://www.orzuai.com/privacy
https://www.orzuai.com/terms
```

Check both hosts return 200:

```bash
curl -I https://www.orzuai.com/
curl -I https://www.orzuai.com/privacy
curl -I https://orzuai.com/
curl -I https://orzuai.com/privacy
```

---

## 2) Google Cloud (YouTube OAuth)

**Console:** [Google Cloud Console](https://console.cloud.google.com/)  
→ APIs & Services → Credentials → your **OAuth 2.0 Client ID** (Web application)

### Authorized JavaScript origins (both hosts + local)

```
https://www.orzuai.com
https://orzuai.com
http://localhost:3000
```

### Authorized redirect URIs (both hosts + local)

```
https://www.orzuai.com/api/youtube/callback
https://orzuai.com/api/youtube/callback
http://localhost:3000/api/youtube/callback
```

Save. Wait 1–5 minutes.

**OAuth consent screen**:
- App name: `OrzuAi`
- User support email: your email
- Authorized domains: `orzuai.com`
- Application home page: `https://www.orzuai.com`
- Privacy policy: `https://www.orzuai.com/privacy`
- Terms of service: `https://www.orzuai.com/terms`
- Scopes: YouTube upload / readonly / force-ssl (already requested in code)

---

## 3) Supabase Auth

**Dashboard → Authentication → URL Configuration**

| Field | Value |
|-------|--------|
| Site URL | `https://www.orzuai.com` |
| Redirect URLs | `https://www.orzuai.com/**` |
| | `https://orzuai.com/**` |
| | `http://localhost:3000/**` |

---

## 4) Cloudflare R2 — media.orzuai.com

1. R2 → bucket `orzu-media` → **Settings → Custom Domains**  
   Connect: `media.orzuai.com`
2. DNS: Cloudflare creates CNAME for `media` → R2 (proxied OK)

### CORS (R2 bucket → Settings → CORS)

Both app hosts allowed:

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

Env (Vercel + Railway worker):

```
R2_PUBLIC_BASE_URL=https://media.orzuai.com
```

---

## 5) Railway (Python worker)

Same R2 + Supabase vars as production. Worker does **not** need `NEXT_PUBLIC_APP_URL` / YouTube redirect (web handles OAuth).

---

## 6) Local `.env.local` (dev only)

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
| Vercel Domains | `www.orzuai.com` **и** `orzuai.com` |
| Vercel env (primary) | `NEXT_PUBLIC_APP_URL=https://www.orzuai.com` |
| Vercel env (primary) | `YOUTUBE_REDIRECT_URI=https://www.orzuai.com/api/youtube/callback` |
| Google → Origins | `https://www.orzuai.com` **и** `https://orzuai.com` |
| Google → Redirect | оба `…/api/youtube/callback` |
| Google consent | `https://www.orzuai.com` (+ `/privacy`, `/terms`) |
| Supabase Site URL | `https://www.orzuai.com` |
| Supabase Redirect | оба `/**` + localhost |
| R2 CORS | оба origin + localhost |
| R2 custom domain | `media.orzuai.com` |

---

## Check after deploy

1. Open https://www.orzuai.com **and** https://orzuai.com → both load  
2. Connect YouTube → returns to `/dashboard/channel`  
3. Media from `media.orzuai.com` / signed preview works  
4. Clipping upload CORS OK from either host
