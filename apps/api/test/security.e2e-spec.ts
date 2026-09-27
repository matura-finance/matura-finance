import { Controller, Get, type INestApplication, Post, Req, VersioningType } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Request } from "express";
import helmet from "helmet";
import request from "supertest";

import { AllExceptionsFilter } from "../src/common/api-error.filter";
import { AuthJwtService } from "../src/auth/jwt.service";
import { Public } from "../src/auth/public.decorator";
import { WalletAuthGuard } from "../src/auth/wallet-auth.guard";
import { WalletThrottlerGuard } from "../src/auth/wallet-throttler.guard";

// HTTP security-surface e2e: headers, CORS allowlist, per-wallet rate limit, authz + subject
// binding, and body-size limit — bootstrapped like `src/main.ts`. supertest + Test.createTestingModule.

const CHAIN_ID = 31337;
const WALLET_A = "0xaaa0000000000000000000000000000000000001";
const WALLET_B = "0xbbb0000000000000000000000000000000000002";

/** Test token format: "<wallet>:<chainId>". Mirrors the real JWT verify contract (wallet + chainId). */
const tokenFor = (wallet: string, chainId: number): string => `${wallet}:${String(chainId)}`;

const jwtStub = {
  verify: (token: string): Promise<{ wallet: string; chainId: number }> => {
    const [wallet, chainId] = token.split(":");
    if (wallet === undefined || chainId === undefined || !/^\d+$/.test(chainId)) {
      throw new Error("invalid token");
    }
    return Promise.resolve({ wallet, chainId: Number(chainId) });
  },
};

@Controller("ping")
class PingController {
  @Public()
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Post("echo")
  echo(@Req() req: Request): { size: number } {
    return { size: JSON.stringify(req.body).length };
  }
}

@Controller("account")
class AccountController {
  // Data is scoped to the JWT subject (req.wallet), NEVER the client-supplied :address param.
  @Get(":address")
  account(@Req() req: Request): { wallet: string | undefined } {
    return { wallet: (req as unknown as { wallet?: string }).wallet };
  }
}

/** Mirrors `main.ts`: trimmed, non-empty, never-wildcard CORS allowlist parsed from a CSV. */
function parseCorsOrigins(csv: string): string[] {
  return csv
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== "*");
}

interface AppOptions {
  corsCsv?: string;
  limit?: number;
}

async function createApp(options: AppOptions = {}): Promise<INestApplication> {
  const limit = options.limit ?? 1000;
  const configStub = {
    get: (key: string): unknown => (key === "CHAIN_ID" ? CHAIN_ID : undefined),
  };

  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit }] })],
    controllers: [PingController, AccountController],
    providers: [
      { provide: ConfigService, useValue: configStub },
      { provide: AuthJwtService, useValue: jwtStub },
      { provide: APP_GUARD, useClass: WalletAuthGuard },
      { provide: APP_GUARD, useClass: WalletThrottlerGuard },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set("trust proxy", 1);
  // Production helmet variant (full CSP + HSTS), matching `main.ts` when NODE_ENV=production.
  app.use(helmet());
  app.useBodyParser("json", { limit: "100kb" });
  app.enableCors({ origin: parseCorsOrigins(options.corsCsv ?? ""), credentials: true });
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  await app.init();
  return app;
}

describe("Security headers (helmet, prod mode)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("sets X-Content-Type-Options, HSTS, and CSP", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/ping")
      .set("Authorization", `Bearer ${tokenFor(WALLET_A, CHAIN_ID)}`);
    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toBeDefined();
  });
});

describe("CORS allowlist", () => {
  it("reflects an allowlisted Origin and rejects a non-allowlisted one", async () => {
    const app = await createApp({ corsCsv: "https://app.matura.xyz" });
    try {
      const allowed = await request(app.getHttpServer())
        .get("/api/v1/ping")
        .set("Origin", "https://app.matura.xyz");
      expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.matura.xyz");

      const denied = await request(app.getHttpServer())
        .get("/api/v1/ping")
        .set("Origin", "https://evil.example.com");
      expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("filters a wildcard out of the allowlist (never reflects '*')", async () => {
    expect(parseCorsOrigins("https://app.matura.xyz,*")).toEqual(["https://app.matura.xyz"]);
    const app = await createApp({ corsCsv: "https://app.matura.xyz,*" });
    try {
      const res = await request(app.getHttpServer()).get("/api/v1/ping").set("Origin", "*");
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("an empty allowlist blocks all cross-origin requests", async () => {
    expect(parseCorsOrigins("")).toEqual([]);
    const app = await createApp({ corsCsv: "" });
    try {
      const res = await request(app.getHttpServer())
        .get("/api/v1/ping")
        .set("Origin", "https://app.matura.xyz");
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});

describe("Authorization + subject binding", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects a request with no Authorization header (401)", async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/account/${WALLET_A}`);
    expect(res.status).toBe(401);
  });

  it("rejects a blank / scheme-only Authorization header (401)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/account/${WALLET_A}`)
      .set("Authorization", "Bearer ");
    expect(res.status).toBe(401);
  });

  it("rejects a token minted for a different chain (401 — cross-chain replay guard)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/account/${WALLET_A}`)
      .set("Authorization", `Bearer ${tokenFor(WALLET_A, 97)}`);
    expect(res.status).toBe(401);
  });

  it("binds the response to the JWT subject — wallet A cannot read wallet B's data via the path param", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/account/${WALLET_B}`)
      .set("Authorization", `Bearer ${tokenFor(WALLET_A, CHAIN_ID)}`);
    expect(res.status).toBe(200);
    // The controller returns the AUTHENTICATED wallet, never the requested :address.
    expect(res.body.wallet).toBe(WALLET_A);
  });
});

describe("Per-wallet rate limiting", () => {
  it("shares one budget for a wallet across source IPs → 429 TOO_MANY_REQUESTS", async () => {
    const app = await createApp({ limit: 5 });
    try {
      const auth = `Bearer ${tokenFor(WALLET_A, CHAIN_ID)}`;
      for (let i = 0; i < 5; i++) {
        const ok = await request(app.getHttpServer())
          .get(`/api/v1/account/${WALLET_A}`)
          .set("Authorization", auth)
          .set("X-Forwarded-For", "1.1.1.1");
        expect(ok.status).toBe(200);
      }
      // Same wallet, DIFFERENT source IP: still over budget (keyed by wallet, not IP).
      const limited = await request(app.getHttpServer())
        .get(`/api/v1/account/${WALLET_A}`)
        .set("Authorization", auth)
        .set("X-Forwarded-For", "2.2.2.2");
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe("TOO_MANY_REQUESTS");
    } finally {
      await app.close();
    }
  });

  it("public routes fall back to IP keying (distinct IPs get independent budgets)", async () => {
    const app = await createApp({ limit: 3 });
    try {
      for (let i = 0; i < 3; i++) {
        const ok = await request(app.getHttpServer())
          .get("/api/v1/ping")
          .set("X-Forwarded-For", "10.0.0.1");
        expect(ok.status).toBe(200);
      }
      const limited = await request(app.getHttpServer())
        .get("/api/v1/ping")
        .set("X-Forwarded-For", "10.0.0.1");
      expect(limited.status).toBe(429);
      // A different IP still has its own budget.
      const other = await request(app.getHttpServer())
        .get("/api/v1/ping")
        .set("X-Forwarded-For", "10.0.0.2");
      expect(other.status).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe("Request body-size limit (100kb)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("accepts a small JSON body", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/ping/echo")
      .set("Authorization", `Bearer ${tokenFor(WALLET_A, CHAIN_ID)}`)
      .send({ data: "x".repeat(1000) });
    expect(res.status).toBe(201);
  });

  it("rejects a body larger than 100kb (413 Payload Too Large)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/ping/echo")
      .set("Authorization", `Bearer ${tokenFor(WALLET_A, CHAIN_ID)}`)
      .send({ data: "x".repeat(200 * 1024) });
    expect(res.status).toBe(413);
  });
});
