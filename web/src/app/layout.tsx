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
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: "OrzuAi — AI YouTube Shorts Studio",
    description:
      "Train once. OrzuAi creates and publishes YouTube Shorts with AI scripts, voice, media, and scheduling.",
    url: "https://www.orzuai.com",
    siteName: "OrzuAi",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OrzuAi — AI YouTube Shorts Studio",
    description:
      "AI YouTube Shorts studio: scripts, voice, captions, clipping, and publishing.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
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
  const jsonLd = {
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
      email: "support@orzuai.com",
    },
  };

  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} h-full`}>
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
