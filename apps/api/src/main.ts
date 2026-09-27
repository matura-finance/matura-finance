import "reflect-metadata";

import { Logger, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";

import { AppModule } from "./app.module";
import { applySecurity, parseCorsOrigins } from "./common/security-bootstrap";
import type { Env } from "./config/env.validation";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Swagger/docs are dev-only; fail closed on a missing/unknown NODE_ENV.
  const nodeEnv = config.get("NODE_ENV", { infer: true });
  const isProduction = nodeEnv === "production";

  // Trust proxy + security headers + strict body limit + CORS allowlist (shared with the e2e).
  const corsOrigins = parseCorsOrigins(config.get("API_CORS_ORIGINS", { infer: true }));
  applySecurity(app, { corsOrigins, isProduction });

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
