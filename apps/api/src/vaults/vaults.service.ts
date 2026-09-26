import { Injectable } from "@nestjs/common";
import { CLAIM_TYPES, type ClaimType } from "@matura/shared";
import type { z } from "zod";

import { ContractsService } from "../chain/contracts.service";
import { CursorService } from "../cursor/cursor.service";
import type { VaultsResponseSchema } from "./vaults.dto";

@Injectable()
export class VaultsService {
  constructor(
    private readonly contracts: ContractsService,
    private readonly cursor: CursorService,
  ) {}

  /** GET /api/v1/vaults — live vault list + mandates (no projection table; read on demand). */
  async list(): Promise<z.infer<typeof VaultsResponseSchema>> {
    const [addresses, finalizedThrough] = await Promise.all([
      this.contracts.getVaults(),
      this.cursor.finalizedThrough(),
    ]);

    const vaults = await Promise.all(
      addresses.map(async (address) => {
        const [mandate, fundableLiquidity] = await Promise.all([
          this.contracts.getMandate(address),
          this.contracts.fundableLiquidity(address),
        ]);
        return {
          address: address.toLowerCase(),
          supportedTypes: decodeSupportedTypes(mandate.supportedTypesBitmap),
          baseDiscountBps: mandate.baseDiscountBps,
          durationBpsPerDay: mandate.durationBpsPerDay,
          maxDurationDays: mandate.maxDurationDays,
          minFace: mandate.minFace.toString(),
          maxFace: mandate.maxFace.toString(),
          liquidityCap: mandate.liquidityCap.toString(),
          fundableLiquidity: fundableLiquidity.toString(),
        };
      }),
    );

    return { vaults, finalizedThrough };
  }
}

/** Decode a `supportedTypesBitmap` (bit i = ClaimTypes ordinal i) into claim-type names. */
function decodeSupportedTypes(bitmap: number): ClaimType[] {
  const supported: ClaimType[] = [];
  for (let ordinal = 0; ordinal < CLAIM_TYPES.length; ordinal += 1) {
    const claimType = CLAIM_TYPES[ordinal];
    if (claimType !== undefined && (bitmap & (1 << ordinal)) !== 0) {
      supported.push(claimType);
    }
  }
  return supported;
}
