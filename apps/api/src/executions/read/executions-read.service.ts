import { Injectable, NotFoundException } from "@nestjs/common";
import type { z } from "zod";

import { CursorService } from "../../cursor/cursor.service";
import type { ExecutionSchema } from "../../common/dto";
import { validateBytes32 } from "../../common/evm.util";
import { mapExecution } from "../../common/mappers";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ExecutionsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursor: CursorService,
  ) {}

  /**
   * GET /api/v1/executions/:executionId. Indexer writes EXECUTED rows only, so a
   * prepared-but-unexecuted id (no row) is a 404.
   */
  async getExecution(rawExecutionId: string): Promise<z.infer<typeof ExecutionSchema>> {
    const executionId = validateBytes32(rawExecutionId, "executionId");
    const [row, finalizedThrough] = await Promise.all([
      this.prisma.routeExecution.findUnique({
        where: { executionId },
        include: { legs: true },
      }),
      this.cursor.finalizedThrough(),
    ]);
    if (row === null) {
      throw new NotFoundException(`Execution not found: ${executionId}`);
    }
    return mapExecution(row, finalizedThrough);
  }
}
