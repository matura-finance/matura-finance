import "reflect-metadata";

import { Logger, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import express from "express";
import helmet from "helmet";
import { cleanupOpenApiDoc } from "nestjs-zod";

import { AppModule } from "./app.module";
import type { Env } from "./config/env.validation";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Security headers + strict request body limit.
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));

  // CORS allowlist parsed from env — trimmed, non-empty, and never a wildcard.
  const corsOrigins = config
    .get("API_CORS_ORIGINS", { infer: true })
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== "*");
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  // Swagger only outside production (fails closed on a missing/unknown NODE_ENV).
  const nodeEnv = config.get("NODE_ENV", { infer: true });
  if (nodeEnv !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Matura API")
      .setDescription("Matura finance API")
      .setVersion("1.0")
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
