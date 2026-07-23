import type { MetadataRoute } from "next";

const SITE = (
  process.env.NEXT_PUBLIC_APP_URL || "https://www.orzuai.com"
).replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: {
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"];
  }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/about", priority: 0.9, changeFrequency: "monthly" },
    { path: "/signup", priority: 0.85, changeFrequency: "monthly" },
    { path: "/login", priority: 0.55, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.4, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.4, changeFrequency: "yearly" },
  ];

  return pages.map((p) => ({
    url: `${SITE}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
    alternates: {
      languages: {
        en: `${SITE}${p.path}`,
        "x-default": `${SITE}${p.path}`,
      },
    },
  }));
}
