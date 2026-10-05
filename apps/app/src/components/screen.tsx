import { Badge } from "@matura/ui/components/badge";
import { Stack } from "@matura/ui/components/stack";
import type { ReactNode } from "react";

import { AppNav } from "./app-nav";

export type ScreenProps = {
  /** Optional section eyebrow label rendered as a pill badge above the title. */
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
};

/**
 * Shared responsive shell for the product routes: global nav + a titled
 * section header. Honest prototype framing — these screens describe what they
 * will show once the underlying flows are wired up.
 */
export function Screen({ eyebrow, title, description, children }: ScreenProps) {
  return (
    <div className="min-h-dvh bg-muted text-foreground">
      <AppNav />
      <main>
        {/* Wider than the default reading column, with a clearly larger side gap than the header. */}
        <div className="mx-auto w-full max-w-[1760px] px-4 sm:px-16 lg:px-24">
          {/* Smaller top gap below the navbar; roomy bottom. */}
          <Stack gap="xl" className="pb-section pt-8">
            <Stack gap="sm" className="max-w-4xl">
              {eyebrow !== undefined && (
                <Badge variant="outline" className="w-fit border-border text-foreground">
                  {eyebrow}
                </Badge>
              )}
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {title}
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">{description}</p>
            </Stack>
            {children}
          </Stack>
        </div>
      </main>
    </div>
  );
}
