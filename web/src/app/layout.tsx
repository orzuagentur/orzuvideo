import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";
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
    process.env.NEXT_PUBLIC_APP_URL || "https://orzuai.com",
  ),
  title: "OrzuAi — AI YouTube Shorts",
  description:
    "Train once. OrzuAi creates and publishes two Shorts every day.",
  applicationName: "OrzuAi",
  openGraph: {
    title: "OrzuAi",
    description:
      "Train once. OrzuAi creates and publishes two Shorts every day.",
    url: "https://orzuai.com",
    siteName: "OrzuAi",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
