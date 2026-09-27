import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { DISCLOSURE } from "@/lib/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: "Justin — JustServe Assistant (pilot)",
  description: DISCLOSURE,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#009EB9" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="avatar">J</span>
            <span className="brand-name">Justin</span>
          </Link>
          <nav>
            <Link href="/">Find</Link>
            <Link href="/chat">Chat</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="disclosure">{DISCLOSURE}</footer>
      </body>
    </html>
  );
}
