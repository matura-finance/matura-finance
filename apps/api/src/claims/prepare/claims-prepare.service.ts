import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { claimRegistryDomain, contractAbis } from "@matura/chain";
import { encodeFunctionData } from "viem";
import type { z } from "zod";

import { ChainService } from "../../chain/chain.service";
import { ContractsService } from "../../chain/contracts.service";
import { toHexAddress, validateBytes32 } from "../../common/evm.util";
import {
  type AttestationPrepareSchema,
  buildPrepareResponse,
  type PrepareResponse,
  type PrepareStep,
} from "../../common/prepare.dto";
import { CursorService } from "../../cursor/cursor.service";
import { IssuersService } from "../../issuers/issuers.service";

@Injectable()
export class ClaimsPrepareService {
  constructor(
    private readonly chain: ChainService,
    private readonly contracts: ContractsService,
    private readonly issuers: IssuersService,
    private readonly cursor: CursorService,
  ) {}

  /**
   * POST /api/v1/claims/registration/prepare. Demo convenience: builds + server-signs the
   * attestation and returns the `registerClaim` calldata. Requires demo signing (external
   * issuers use /issuer/attestations/prepare, sign, and submit registerClaim themselves).
   * Pre-checks the claim doesn't already exist on chain (409).
   */
  async prepareRegistration(
    wallet: string,
    body: z.infer<typeof AttestationPrepareSchema>,
  ): Promise<PrepareResponse> {
    if (!this.contracts.canDemoSign) {
      throw new UnprocessableEntityException(
        "registration/prepare requires demo signing; use /issuer/attestations/prepare and submit externally",
      );
    }
    const claimId = validateBytes32(body.claimId, "claimId");
    if ((await this.chain.getClaim(claimId)) !== null) {
      throw new ConflictException(`Claim already exists on chain: ${claimId}`);
    }

    const issuer = toHexAddress(wallet);
    const message = await this.issuers.buildMessage(issuer, body);
    const claimRegistry = this.chain.addresses.claimRegistry;
    const domain = claimRegistryDomain(this.chain.chainId, claimRegistry);
    const signature = await this.contracts.signClaimAttestation(domain, message);

    const data = encodeFunctionData({
      abi: contractAbis.claimRegistry,
      functionName: "registerClaim",
      args: [message, signature],
    });
    const step: PrepareStep = { kind: "transaction", to: claimRegistry, data, value: "0" };
    const summary = `Register claim ${claimId} via ClaimRegistry.registerClaim (server-signed attestation).`;

    return buildPrepareResponse(
      this.chain.chainId,
      [step],
      summary,
      await this.cursor.finalizedThrough(),
    );
  }
}
