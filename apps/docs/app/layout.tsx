import "./global.css";

import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { RootProvider } from "fumadocs-ui/provider";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { DOCS_URL } from "@/lib/site";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const TITLE = "Matura Docs";
const DESCRIPTION =
  "Documentation for Matura — a non-custodial RWA / invoice-financing protocol on BNB Chain: concepts, contracts, API, trust model, and operations.";

export const metadata: Metadata = {
  metadataBase: new URL(DOCS_URL),
  title: {
    default: TITLE,
    template: "%s | Matura Docs",
  },
  description: DESCRIPTION,
  applicationName: "Matura Docs",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: "Matura Docs",
    url: DOCS_URL,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col font-sans antialiased">
        {/* Local Orama search backed by the /api/search route handler (no external service).
            Default to the light theme (the toggle still switches to dark). */}
        <RootProvider theme={{ defaultTheme: "light", enableSystem: false }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
