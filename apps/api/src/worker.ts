import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { WorkerModule } from "./worker.module";

/**
 * Indexer worker entrypoint (`node dist/worker.js`). A standalone application context —
 * no HTTP server. `IndexerService` starts on `onApplicationBootstrap`; `enableShutdownHooks`
 * lets SIGTERM drain the in-flight batch (via `onApplicationShutdown`) before exit.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: false });
  app.enableShutdownHooks();
  Logger.log("Matura indexer worker started", "Worker");
}

void bootstrap();
