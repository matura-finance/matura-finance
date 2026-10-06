import { Badge, type BadgeProps } from "@matura/ui/components/badge";
import { Stack } from "@matura/ui/components/stack";
import type { ReactNode } from "react";

import { AppNav } from "./app-nav";

export type ScreenProps = {
  /** Optional section eyebrow label rendered as an uppercase pill badge above the title. */
  eyebrow?: string;
  /** Badge variant for the eyebrow (e.g. "warning" for the demo/admin surface). Defaults to outline. */
  eyebrowVariant?: BadgeProps["variant"];
  /** Optional page title. When omitted the whole header block (eyebrow/title/description) is skipped. */
  title?: string;
  description?: string;
  children?: ReactNode;
};

/**
 * Shared responsive shell for the product routes: global nav + a titled
 * section header. Honest prototype framing — these screens describe what they
 * will show once the underlying flows are wired up.
 */
export function Screen({
  eyebrow,
  eyebrowVariant = "outline",
  title,
  description,
  children,
}: ScreenProps) {
  return (
    <div className="min-h-dvh bg-muted text-foreground">
      <AppNav />
      <main>
        {/* Wider than the default reading column, with a clearly larger side gap than the header. */}
        <div className="mx-auto w-full max-w-[1760px] px-4 sm:px-16 lg:px-24">
          {/* Smaller top gap below the navbar; roomy bottom. */}
          <Stack gap="xl" className="pb-section pt-8">
            {title !== undefined && (
              <Stack gap="sm" className="max-w-4xl">
                {eyebrow !== undefined && (
                  <Badge variant={eyebrowVariant} className="w-fit uppercase tracking-wide">
                    {eyebrow}
                  </Badge>
                )}
                <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {title}
                </h1>
                {description !== undefined && (
                  <p className="text-sm text-muted-foreground sm:text-base">{description}</p>
                )}
              </Stack>
            )}
            {children}
          </Stack>
        </div>
      </main>
    </div>
  );
}
