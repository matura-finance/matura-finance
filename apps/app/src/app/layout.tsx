import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { cookieToInitialState } from "wagmi";

import { getConfig } from "../lib/wagmi";
import { Providers } from "./providers";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Matura",
  description: "Matura product app — accounts, liquidity requests, and vault mandates.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialState = cookieToInitialState(getConfig(), (await headers()).get("cookie"));

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${manrope.variable}`}>
      <body className="font-ui antialiased">
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}
