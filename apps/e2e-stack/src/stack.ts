import { execFileSync } from "node:child_process";
import { spawn, type ChildProcess } from "node:child_process";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPublicClient, http } from "viem";
import { hardhatLocal } from "@matura/chain";
import { API_PORT, DIRTIED_MANIFEST_PATHS, REPO_ROOT, RPC_URL, childEnv } from "./env.js";

/// Await a child process exit without leaking `node:events.once`'s `Promise<any[]>`.
function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise();
      return;
    }
    child.once("exit", () => {
      resolvePromise();
    });
  });
}

/// Bounded predicate poll — no unbounded await, no dangling timer.
export async function waitFor(
  label: string,
  pred: () => Promise<boolean>,
  opts: { timeoutMs: number; intervalMs: number },
): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  for (;;) {
    if (await pred().catch(() => false)) return;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
}

function run(label: string, cmd: string, args: string[], env?: NodeJS.ProcessEnv): void {
  process.stdout.write(`\n▶ ${label}\n`);
  execFileSync(cmd, args, { cwd: REPO_ROOT, stdio: "inherit", env: env ?? process.env });
}

/// Best-effort: kill whatever holds TCP :8545 so a stale hardhat node from a prior run can't
/// hijack this run (a stale node accumulates blocks → its timestamps race ahead of the API's
/// wall-clock deadline → RouteExpired). Non-fatal if nothing is listening.
function freePort8545(): void {
  try {
    const pids = execFileSync("bash", ["-lc", "lsof -ti tcp:8545 || true"], {
      encoding: "utf8",
    }).trim();
    if (pids !== "") {
      for (const pid of pids.split("\n")) {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }
  } catch {
    /* lsof unavailable — best effort only */
  }
}

export interface Stack {
  databaseUrl: string;
  stop: () => Promise<void>;
}

/// Boot the full local stack: Postgres (Testcontainers) + hardhat node + deploy/seed + a rebuilt
/// @matura/chain + the indexer worker + the HTTP API. Returns a handle whose `stop()` tears every
/// piece down in a safe order (idempotent). Any partial failure still tears down what started.
export async function startStack(): Promise<Stack> {
  let container: StartedPostgreSqlContainer | undefined;
  let node: ChildProcess | undefined;
  let worker: ChildProcess | undefined;
  let api: ChildProcess | undefined;

  const stop = async (): Promise<void> => {
    // API + worker first, then await their exits, THEN stop Postgres (else the worker spams
    // connection errors mid-shutdown), THEN restore + rebuild the manifest, THEN the node.
    api?.kill("SIGTERM");
    worker?.kill("SIGTERM");
    if (api !== undefined) await waitForExit(api);
    if (worker !== undefined) await waitForExit(worker);
    if (container !== undefined) await container.stop();
    try {
      execFileSync("git", ["checkout", "--", ...DIRTIED_MANIFEST_PATHS], {
        cwd: REPO_ROOT,
        stdio: "inherit",
      });
      // dist is gitignored → rebuild @matura/chain from the restored src so later runs see zeros.
      execFileSync("pnpm", ["--filter", "@matura/chain", "build"], {
        cwd: REPO_ROOT,
        stdio: "inherit",
      });
    } catch (error: unknown) {
      process.stderr.write(
        `teardown restore warning: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
    if (node?.pid !== undefined) {
      try {
        process.kill(-node.pid, "SIGTERM"); // kill the whole process group (pnpm → hardhat)
      } catch {
        node.kill("SIGTERM");
      }
      await waitForExit(node);
    }
    freePort8545(); // belt-and-suspenders: ensure :8545 is released for the next run
  };

  try {
    // 1. Postgres + migrations (reproducible: the committed migrations, same SQL as CI/prod).
    process.stdout.write("\n▶ starting Postgres container…\n");
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("matura_e2e")
      .withUsername("test")
      .withPassword("test")
      .start();
    const databaseUrl = container.getConnectionUri();
    run(
      "prisma migrate deploy",
      "pnpm",
      ["--filter", "@matura/api", "exec", "prisma", "migrate", "deploy"],
      {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    );

    // 2. Local hardhat node (fresh — free the port first so no stale node is reused). `detached`
    //    makes it a process-group leader so teardown can kill the whole pnpm → hardhat tree.
    freePort8545();
    process.stdout.write("\n▶ starting hardhat node…\n");
    node = spawn("pnpm", ["--filter", "@matura/contracts", "node"], {
      cwd: REPO_ROOT,
      stdio: "ignore",
      env: process.env,
      detached: true,
    });
    const publicClient = createPublicClient({ chain: hardhatLocal, transport: http(RPC_URL) });
    await waitFor("hardhat node RPC", async () => (await publicClient.getBlockNumber()) >= 0n, {
      timeoutMs: 30_000,
      intervalMs: 500,
    });

    // 3. Deploy + seed (fresh), then rebuild @matura/chain so its dist carries the real addresses.
    run("demo:reset", "pnpm", ["--filter", "@matura/contracts", "run", "demo:reset"]);
    run("deploy:local", "pnpm", ["--filter", "@matura/contracts", "run", "deploy:local"]);
    run("seed:local", "pnpm", ["--filter", "@matura/contracts", "run", "seed:local"]);
    run("build @matura/chain", "pnpm", ["--filter", "@matura/chain", "build"]);

    // 4. Build the API (prisma generate + nest build) once, then boot the worker + HTTP API.
    run("build @matura/api", "pnpm", ["--filter", "@matura/api", "build"]);
    process.stdout.write("\n▶ booting indexer worker…\n");
    worker = spawn("node", ["apps/api/dist/worker.js"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: childEnv(databaseUrl),
    });
    process.stdout.write("\n▶ booting HTTP API…\n");
    api = spawn("node", ["apps/api/dist/main.js"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: childEnv(databaseUrl, { PORT: String(API_PORT) }),
    });
    await waitFor(
      "HTTP API ready",
      async () => {
        const res = await fetch(`http://127.0.0.1:${String(API_PORT)}/api/v1/vaults`);
        return res.ok;
      },
      { timeoutMs: 30_000, intervalMs: 500 },
    );

    return { databaseUrl, stop };
  } catch (error: unknown) {
    await stop();
    throw error;
  }
}
