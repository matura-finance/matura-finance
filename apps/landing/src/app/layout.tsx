import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { SiteFooter } from "../components/site-footer";
import { SiteNav } from "../components/site-nav";
import { GITHUB_URL, SITE_URL } from "../lib/site";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Every page renders exactly "Matura" as its title — no per-page suffix.
  title: "Matura",
  description:
    "Matura aggregates verified future payments, assigns only what you need, and routes each request across competing onchain liquidity on BNB Chain.",
  applicationName: "Matura",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    title: "Matura",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Matura",
    url: SITE_URL,
    title: "Matura",
    description:
      "Matura aggregates verified future payments, assigns only what you need, and routes each request across competing onchain liquidity on BNB Chain.",
  },
  twitter: {
    card: "summary",
    title: "Matura",
    description:
      "Matura aggregates verified future payments, assigns only what you need, and routes each request across competing onchain liquidity on BNB Chain.",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Matura",
  url: SITE_URL,
  logo: `${SITE_URL}/web-app-manifest-512x512.png`,
  sameAs: [GITHUB_URL],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${manrope.variable}`}>
      <body className="font-ui antialiased">
        <script
          type="application/ld+json"
          // Static, developer-authored object — never user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <div className="flex min-h-screen flex-col bg-mist text-midnight">
          <SiteNav />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
