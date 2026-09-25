import { type INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { HealthModule } from "../src/health/health.module";

describe("Health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts routing essentials so the route matches production.
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
});
