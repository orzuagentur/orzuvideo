import type { MetadataRoute } from "next";

const SITE = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.orzuai.com"
).replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/privacy", "/terms", "/about"],
        disallow: [
          "/dashboard",
          "/api/",
          "/auth/",
          "/login/verify",
          "/auth/reset-password",
        ],
      },
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
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
