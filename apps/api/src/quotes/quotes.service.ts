import { Injectable } from "@nestjs/common";
import { CLAIM_TYPES } from "@matura/shared";
import type { z } from "zod";

import { ContractsService } from "../chain/contracts.service";
import { isoToUnix, parseUint256 } from "../common/amount.util";
import type { QuotePreviewSchema, QuotesResponseSchema } from "./quotes.dto";
import { toHexAddress } from "../common/evm.util";
import { CursorService } from "../cursor/cursor.service";

@Injectable()
export class QuotesService {
  constructor(
    private readonly contracts: ContractsService,
    private readonly cursor: CursorService,
  ) {}

  /**
   * POST /api/v1/quotes/preview. Live per-vault quotes via revert-free `quoteAndCheck`
   * (ok=false = mandate-rejected). Vaults are read live (no projection table).
   */
  async preview(body: z.infer<typeof QuotePreviewSchema>): Promise<z.infer<typeof QuotesResponseSchema>> {
    const issuer = toHexAddress(body.issuer);
    const claimType = CLAIM_TYPES.indexOf(body.claimType);
    const faceValue = parseUint256(body.faceValue, "faceValue");
    const dueDate = isoToUnix(body.dueAt, "dueAt");

    const [vaults, finalizedThrough] = await Promise.all([
      this.contracts.getVaults(),
      this.cursor.finalizedThrough(),
    ]);

    const quotes = await Promise.all(
      vaults.map(async (vault) => {
        const quote = await this.contracts.quoteAndCheck(vault, issuer, claimType, faceValue, dueDate);
        return {
          vault: vault.toLowerCase(),
          ok: quote.ok,
          advanceAmount: quote.advanceAmount.toString(),
          discountAmount: quote.discountAmount.toString(),
        };
      }),
    );

    return { quotes, finalizedThrough };
  }
}
