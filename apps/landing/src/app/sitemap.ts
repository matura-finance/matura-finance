import type { MetadataRoute } from "next";

import { SITE_URL } from "../lib/site";

const ROUTES = [
  "/",
  "/how-it-works",
  "/protocol",
  "/for-issuers",
  "/docs",
  "/privacy",
  "/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((route) => ({
    url: new URL(route, SITE_URL).toString(),
    lastModified,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
