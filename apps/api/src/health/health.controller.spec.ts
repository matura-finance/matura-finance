import { HealthController } from "./health.controller";
import type { HealthService } from "./health.service";

describe("HealthController", () => {
  const health = { liveness: jest.fn().mockReturnValue({ status: "ok" }) } as unknown as HealthService;
  const controller = new HealthController(health);

  it("check() returns { status: 'ok' }", () => {
    expect(controller.check()).toEqual({ status: "ok" });
  });
});
