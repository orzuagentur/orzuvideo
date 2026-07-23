import type { Metadata, Viewport } from "next";
import { DM_Sans, Syne } from "next/font/google";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://www.orzuai.com",
  ),
  title: {
    default: "OrzuAi — AI YouTube Shorts Studio",
    template: "%s · OrzuAi",
  },
  description:
    "OrzuAi is an AI creator studio: generate YouTube Shorts with scripts, voice, captions, stock montage, AI clipping, music, and optional YouTube publishing.",
  applicationName: "OrzuAi",
  keywords: [
    "OrzuAi",
    "AI YouTube Shorts",
    "AI video generator",
    "YouTube Shorts automation",
    "AI clipping tool",
    "auto publish Shorts",
    "creator AI studio",
    "short form video AI",
  ],
  authors: [{ name: "OrzuAi", url: "https://www.orzuai.com" }],
  creator: "OrzuAi",
  publisher: "OrzuAi",
  category: "technology",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "OrzuAi",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    title: "OrzuAi — AI YouTube Shorts Studio",
    description:
      "Train once. OrzuAi creates and publishes YouTube Shorts with AI scripts, voice, media, and scheduling.",
    url: "https://www.orzuai.com",
    siteName: "OrzuAi",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "OrzuAi",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OrzuAi — AI YouTube Shorts Studio",
    description:
      "AI YouTube Shorts studio: scripts, voice, captions, clipping, and publishing.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION || undefined,
    other: {
      ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
        ? {
            "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
          }
        : {}),
    },
  },
  other: {
    "msapplication-TileColor": "#0c0c0c",
    "msapplication-config": "/browserconfig.xml",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0c0c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "OrzuAi",
      url: "https://www.orzuai.com",
      email: "support@orzuai.com",
      logo: "https://www.orzuai.com/logo-mark.png",
      image: "https://www.orzuai.com/og.png",
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "OrzuAi",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      url: "https://www.orzuai.com",
      description:
        "AI creator studio for YouTube Shorts: scripts, voice, captions, montage, AI clipping, and YouTube publishing.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      publisher: {
        "@type": "Organization",
        name: "OrzuAi",
        url: "https://www.orzuai.com",
        logo: "https://www.orzuai.com/logo-mark.png",
      },
      image: "https://www.orzuai.com/og.png",
    },
  ];

  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} h-full`}>
      <head>
        <link
          rel="search"
          type="application/opensearchdescription+xml"
          title="OrzuAi"
          href="/opensearch.xml"
        />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
        <link rel="alternate" type="text/plain" href="/ai.txt" title="ai.txt" />
      </head>
      <body className="min-h-full antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
