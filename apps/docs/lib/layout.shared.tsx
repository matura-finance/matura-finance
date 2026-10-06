import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { APP_URL, GITHUB_URL, LANDING_URL } from "@/lib/site";

/**
 * Shared layout options (nav title, cross-origin links, GitHub link) used by the docs layout.
 * Kept in one place so the home + docs layouts stay consistent.
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Matura Docs",
    },
    links: [
      { text: "Home", url: LANDING_URL },
      { text: "Open app", url: APP_URL },
    ],
    githubUrl: GITHUB_URL,
  };
}
