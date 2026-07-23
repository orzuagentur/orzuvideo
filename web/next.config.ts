import type { NextConfig } from "next";

/**
 * Phone / LAN access to `next dev` (e.g. http://192.168.x.x:3000) needs the
 * host listed here — otherwise Next blocks /_next assets and the dashboard
 * appears broken after login.
 *
 * Override extra hosts via ALLOWED_DEV_ORIGINS=host1,host2 in .env.local
 */
const extraDevOrigins = (process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  /* Both orzuai.com and www.orzuai.com are allowed; no host lock. */
  allowedDevOrigins: [
    "192.168.178.25",
    "127.0.0.1",
    ...extraDevOrigins,
  ],
};

export default nextConfig;
