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
  title: "OrzuAi — AI YouTube Shorts",
  description:
    "Train once. OrzuAi creates and publishes two Shorts every day.",
  applicationName: "OrzuAi",
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
    title: "OrzuAi",
    description:
      "Train once. OrzuAi creates and publishes two Shorts every day.",
    url: "https://www.orzuai.com",
    siteName: "OrzuAi",
    type: "website",
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
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
