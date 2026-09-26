import { execSync } from "node:child_process";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Ephemeral Postgres for integration tests. Spins a pinned container, applies the
 * committed migrations with `prisma migrate deploy` (the reproducible path — same SQL
 * that runs in CI/prod), and returns a connected PrismaClient.
 *
 * Requires a Docker daemon. Not part of `pnpm test`; run via `pnpm test:int`.
 */
export interface TestDb {
  container: StartedPostgreSqlContainer;
  prisma: PrismaClient;
  stop: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("matura_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const url = container.getConnectionUri();
  execSync("pnpm exec prisma migrate deploy", {
    cwd: `${__dirname}/../..`,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({ datasourceUrl: url });
  await prisma.$connect();

  return {
    container,
    prisma,
    stop: async () => {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}
