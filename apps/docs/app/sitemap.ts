import type { MetadataRoute } from "next";

import { DOCS_URL } from "@/lib/site";
import { source } from "@/lib/source";

// Enumerate every docs page (authored + generated) for the sitemap, absolute against DOCS_URL.
export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({
    url: new URL(page.url, DOCS_URL).toString(),
    changeFrequency: "weekly",
    priority: page.url === "/docs" ? 1 : 0.7,
  }));
}
