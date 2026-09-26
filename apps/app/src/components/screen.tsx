import { Badge } from "@matura/ui/components/badge";
import { Container } from "@matura/ui/components/container";
import { Stack } from "@matura/ui/components/stack";
import type { ReactNode } from "react";

import { AppNav } from "./app-nav";

export type ScreenProps = {
  /** Section eyebrow label rendered as a pill badge. */
  eyebrow: string;
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
    <div className="min-h-dvh bg-background text-foreground">
      <AppNav />
      <main>
        <Container>
          <Stack gap="xl" className="py-section">
            <Stack gap="md" className="max-w-2xl">
              <Badge variant="outline" className="w-fit border-border text-foreground">
                {eyebrow}
              </Badge>
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {title}
              </h1>
              <p className="text-base text-muted-foreground sm:text-lg">{description}</p>
            </Stack>
            {children}
          </Stack>
        </Container>
      </main>
    </div>
  );
}
