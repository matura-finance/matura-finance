import { Container } from "@matura/ui/components/container";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";

import { SiteNav } from "../components/site-nav";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Matura — Liquidity for what you've already earned.",
  description:
    "Matura turns verified, already-earned entitlements into liquidity you can use today — without giving up what settles tomorrow.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${manrope.variable}`}>
      <body className="font-ui antialiased">
        <div className="flex min-h-screen flex-col bg-deep-night text-mist">
          <SiteNav />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-white/10">
            <Container>
              <div className="flex flex-col gap-2 py-8 text-sm text-mist/60 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  © {new Date().getFullYear()} Matura. Liquidity for what you&apos;ve already
                  earned.
                </p>
                <div className="flex gap-4">
                  <Link href="/docs" className="hover:text-liquid-mint">
                    Docs
                  </Link>
                  <Link href="/privacy" className="hover:text-liquid-mint">
                    Privacy
                  </Link>
                </div>
              </div>
            </Container>
          </footer>
        </div>
      </body>
    </html>
  );
}
