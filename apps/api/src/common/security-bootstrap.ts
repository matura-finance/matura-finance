import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";

/**
 * Parse the CORS allowlist from a CSV env value — trimmed, non-empty, and never a wildcard.
 * Shared by `main.ts` and the security e2e so the two can't drift.
 */
export function parseCorsOrigins(csv: string): string[] {
  return csv
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== "*");
}

interface SecurityOptions {
  corsOrigins: string[];
  isProduction: boolean;
}

/**
 * Apply the HTTP security surface: trust one reverse proxy (so the IP-keyed throttler sees the real
 * client IP), security headers, a strict request body limit, and the CORS allowlist. Outside
 * production the default Content-Security-Policy is relaxed so the dev-only Swagger UI can render.
 * The single source of truth for both `main.ts` and the security e2e.
 */
export function applySecurity(app: NestExpressApplication, options: SecurityOptions): void {
  app.set("trust proxy", 1);
  app.use(helmet(options.isProduction ? undefined : { contentSecurityPolicy: false }));
  app.useBodyParser("json", { limit: "100kb" });
  app.enableCors({ origin: options.corsOrigins, credentials: true });
}
