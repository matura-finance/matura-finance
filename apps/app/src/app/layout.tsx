import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { cookieToInitialState } from "wagmi";

import { wagmiConfig } from "../lib/appkit-config";
import { env } from "../lib/env";
import { Providers } from "./providers";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: "Matura",
  description: "Matura product app — accounts, liquidity requests, and vault mandates.",
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
  // The wallet-connected product app is not a search entry point — the landing
  // site (usematura.xyz) is the indexed surface. Keep this app out of the index.
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    type: "website",
    siteName: "Matura",
    url: env.appUrl,
    title: "Matura",
    description: "Matura product app — accounts, liquidity requests, and vault mandates.",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialState = cookieToInitialState(wagmiConfig, (await headers()).get("cookie"));

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${manrope.variable}`}>
      <body className="font-ui antialiased">
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}
