import { BadRequestException, NotFoundException } from "@nestjs/common";

import { ExecutionsReadService } from "./executions-read.service";
import type { CursorService } from "../../cursor/cursor.service";
import type { PrismaService } from "../../prisma/prisma.service";

const EXEC_ID = `0x${"cd".repeat(32)}`;

function makeService(findUnique: jest.Mock): ExecutionsReadService {
  const prisma = { routeExecution: { findUnique } } as unknown as PrismaService;
  const cursor = { finalizedThrough: jest.fn().mockResolvedValue("7") } as unknown as CursorService;
  return new ExecutionsReadService(prisma, cursor);
}

describe("ExecutionsReadService", () => {
  it("rejects a malformed executionId with 400", async () => {
    await expect(makeService(jest.fn()).getExecution("0xzz")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("404s a prepared-but-unexecuted id (no row)", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    await expect(makeService(findUnique).getExecution(EXEC_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("maps an execution with its legs", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      executionId: EXEC_ID,
      user: "0xabc",
      targetAdvance: "4800000000",
      totalAdvance: "4800000000",
      totalFaceAssigned: "5000000000",
      totalCost: "200000000",
      status: "EXECUTED",
      legs: [
        {
          claimId: `0x${"11".repeat(32)}`,
          vault: "0xvault",
          faceAmount: "5000000000",
          advanceAmount: "4800000000",
          discountAmount: "200000000",
        },
      ],
    });
    const result = await makeService(findUnique).getExecution(EXEC_ID);
    expect(result.status).toBe("EXECUTED");
    expect(result.legs).toHaveLength(1);
    expect(result.finalizedThrough).toBe("7");
  });
});
