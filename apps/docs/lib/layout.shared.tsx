import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { ArrowUpRight, Home } from "lucide-react";

import { APP_URL, GITHUB_URL, LANDING_URL } from "@/lib/site";

/**
 * Shared layout options (nav title, cross-origin links, GitHub link) used by the docs layout.
 * Kept in one place so the home + docs layouts stay consistent. Home + Open app are cross-origin
 * links, each with an icon.
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Matura Docs",
    },
    links: [
      { text: "Home", url: LANDING_URL, icon: <Home />, external: true },
      { text: "Open app", url: APP_URL, icon: <ArrowUpRight />, external: true },
    ],
    githubUrl: GITHUB_URL,
  };
}
