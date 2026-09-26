import { Injectable } from "@nestjs/common";
import type { z } from "zod";

import { CursorService } from "../cursor/cursor.service";
import { normalizeWallet } from "../common/evm.util";
import { mapClaim } from "../common/mappers";
import type { PortfolioSchema } from "../common/dto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursor: CursorService,
  ) {}

  /** Portfolio for a wallet: its claims (newest first) + the projection's finalized extent. */
  async getPortfolio(rawWallet: string): Promise<z.infer<typeof PortfolioSchema>> {
    const wallet = normalizeWallet(rawWallet);
    const [claims, finalizedThrough] = await Promise.all([
      this.prisma.claimProjection.findMany({
        where: { beneficiary: wallet },
        orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
      }),
      this.cursor.finalizedThrough(),
    ]);
    return { wallet, claims: claims.map((claim) => mapClaim(claim)), finalizedThrough };
  }
}
