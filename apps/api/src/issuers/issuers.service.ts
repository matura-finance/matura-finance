import { Injectable } from "@nestjs/common";
import { CLAIM_ATTESTATION_TYPES, claimRegistryDomain } from "@matura/chain";
import { CLAIM_TYPES } from "@matura/shared";
import type { Hex } from "viem";
import type { z } from "zod";

import { ChainService } from "../chain/chain.service";
import { ContractsService } from "../chain/contracts.service";
import { isoToUnix, parseUint256 } from "../common/amount.util";
import {
  buildAttestation,
  type ClaimAttestationMessage,
  randomNonce,
  serializeAttestation,
} from "../common/attestation";
import { toHexAddress, validateBytes32 } from "../common/evm.util";
import type { AttestationPrepareSchema } from "../common/prepare.dto";
import { buildPrepareResponse, type PrepareResponse, type PrepareStep } from "../common/prepare.dto";
import { CursorService } from "../cursor/cursor.service";

const ATTESTATION_DEADLINE_SECONDS = 3600;

@Injectable()
export class IssuersService {
  constructor(
    private readonly chain: ChainService,
    private readonly contracts: ContractsService,
    private readonly cursor: CursorService,
  ) {}

  /**
   * Build the `ClaimAttestation` message for a request, embedding the live signerEpoch and a
   * fresh unordered nonce. Shared by attestation-prepare and (demo) registration-prepare.
   */
  async buildMessage(
    issuer: Hex,
    body: z.infer<typeof AttestationPrepareSchema>,
  ): Promise<ClaimAttestationMessage> {
    const signerEpoch = await this.contracts.currentEpoch(issuer);
    return buildAttestation({
      claimId: validateBytes32(body.claimId, "claimId"),
      issuer,
      beneficiary: toHexAddress(body.beneficiary),
      token: toHexAddress(body.token),
      faceValue: parseUint256(body.faceValue, "faceValue"),
      dueDate: isoToUnix(body.dueAt, "dueAt"),
      claimType: CLAIM_TYPES.indexOf(body.claimType),
      externalIdHash: body.externalIdHash as Hex | undefined,
      evidenceHash: body.evidenceHash as Hex | undefined,
      signerEpoch,
      nonce: randomNonce(),
      deadline: BigInt(Math.floor(Date.now() / 1000) + ATTESTATION_DEADLINE_SECONDS),
    });
  }

  /**
   * POST /api/v1/issuer/attestations/prepare. Returns the EIP-712 ClaimAttestation typed data
   * for an external issuer signer; includes the server signature only when demo signing is on.
   */
  async prepareAttestation(
    wallet: string,
    body: z.infer<typeof AttestationPrepareSchema>,
  ): Promise<PrepareResponse> {
    const issuer = toHexAddress(wallet);
    const message = await this.buildMessage(issuer, body);
    const claimRegistry = this.chain.addresses.claimRegistry;
    const domain = claimRegistryDomain(this.chain.chainId, claimRegistry);

    const step: PrepareStep = {
      kind: "typed-data",
      to: claimRegistry,
      value: "0",
      verifyingContract: claimRegistry,
      typedData: {
        domain,
        types: CLAIM_ATTESTATION_TYPES,
        primaryType: "ClaimAttestation",
        message: serializeAttestation(message),
      },
      nonce: message.nonce.toString(),
      expiry: message.deadline.toString(),
    };
    if (this.contracts.canDemoSign) {
      step.signature = await this.contracts.signClaimAttestation(domain, message);
    }

    const summary = `Sign a ClaimAttestation for claim ${message.claimId} (issuer ${issuer}); submit via ClaimRegistry.registerClaim.`;
    return buildPrepareResponse(
      this.chain.chainId,
      [step],
      summary,
      await this.cursor.finalizedThrough(),
    );
  }
}
