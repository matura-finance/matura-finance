import type { MetadataRoute } from "next";

import { DOCS_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", DOCS_URL).toString(),
  };
}
