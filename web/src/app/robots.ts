import type { MetadataRoute } from "next";

const SITE = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.orzuai.com"
).replace(/\/$/, "");

/** Public pages only — dashboard / API stay private. */
const PUBLIC_ALLOW = [
  "/",
  "/login",
  "/signup",
  "/privacy",
  "/terms",
  "/about",
];

const PRIVATE_DISALLOW = [
  "/dashboard",
  "/api/",
  "/auth/",
  "/login/verify",
  "/auth/reset-password",
  "/auth/forgot-password",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      // Google
      {
        userAgent: "Googlebot",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        userAgent: "Googlebot-Image",
        allow: ["/", "/og.png", "/logo.png", "/logo-mark.png", "/icons/"],
        disallow: ["/dashboard", "/api/"],
      },
      // Bing / Yahoo / DuckDuckGo (Bing index)
      {
        userAgent: "Bingbot",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        userAgent: "DuckDuckBot",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      // Yandex
      {
        userAgent: "Yandex",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        userAgent: "YandexBot",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      // Europe / others
      {
        userAgent: "Applebot",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        userAgent: "SeznamBot",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        userAgent: "Qwantify",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        userAgent: "ecosia",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      // AI crawlers — public marketing pages only
      {
        userAgent: "GPTBot",
        allow: ["/", "/about", "/privacy", "/terms"],
        disallow: ["/dashboard", "/api/", "/auth/"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: ["/", "/about", "/privacy", "/terms"],
        disallow: ["/dashboard", "/api/", "/auth/"],
      },
      {
        userAgent: "Google-Extended",
        allow: ["/", "/about", "/privacy", "/terms"],
      },
      {
        userAgent: "anthropic-ai",
        allow: ["/", "/about", "/privacy", "/terms"],
        disallow: ["/dashboard", "/api/", "/auth/"],
      },
      {
        userAgent: "ClaudeBot",
        allow: ["/", "/about", "/privacy", "/terms"],
        disallow: ["/dashboard", "/api/", "/auth/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: ["/", "/about", "/privacy", "/terms"],
        disallow: ["/dashboard", "/api/", "/auth/"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
