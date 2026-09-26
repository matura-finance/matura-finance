import { type INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { HealthController } from "../src/health/health.controller";
import { HealthService } from "../src/health/health.service";

// Liveness e2e. HealthService is stubbed so the test doesn't require the DB/RPC/cursor deps
// (those are covered by health.service.spec.ts unit tests + the readiness contract).
const stubHealth = {
  liveness: () => ({ status: "ok" as const }),
  readiness: () =>
    Promise.resolve({
      status: "ok" as const,
      checks: {
        db: { status: "up" as const },
        rpc: { status: "up" as const },
        cursor: { status: "up" as const, lagMs: 0, lagBlocks: 0 },
      },
    }),
};

describe("Health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: stubHealth }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/health -> 200 { status: 'ok' }", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("GET /api/v1/health/ready -> 200 when all checks up", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health/ready");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });
});
