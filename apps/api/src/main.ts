import "reflect-metadata";

import { Logger, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { cleanupOpenApiDoc } from "nestjs-zod";

import { AppModule } from "./app.module";
import type { Env } from "./config/env.validation";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Trust one reverse proxy so the IP-keyed throttler sees the real client IP.
  app.set("trust proxy", 1);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Swagger/docs are dev-only; fail closed on a missing/unknown NODE_ENV.
  const nodeEnv = config.get("NODE_ENV", { infer: true });
  const isProduction = nodeEnv === "production";

  // Security headers + strict request body limit. Outside production the default
  // Content-Security-Policy is relaxed so the dev-only Swagger UI can render.
  app.use(helmet(isProduction ? undefined : { contentSecurityPolicy: false }));
  app.useBodyParser("json", { limit: "100kb" });

  // CORS allowlist parsed from env — trimmed, non-empty, and never a wildcard.
  const corsOrigins = config
    .get("API_CORS_ORIGINS", { infer: true })
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== "*");
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  // Swagger only outside production.
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Matura API")
      .setDescription("Matura finance API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      ignoreGlobalPrefix: true,
    });
    SwaggerModule.setup("docs", app, cleanupOpenApiDoc(document));
  }

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
  Logger.log(`Matura API listening on port ${String(port)}`, "Bootstrap");
}

void bootstrap();
