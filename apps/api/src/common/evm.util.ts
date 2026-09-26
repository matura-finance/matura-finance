import { BadRequestException } from "@nestjs/common";
import { getAddress, isAddress, type Hex } from "viem";

/**
 * Validate a raw wallet path/param as a real EVM address (viem `getAddress` enforces EIP-55
 * when mixed-case) and return it lowercased — projections store addresses lowercase, so every
 * query normalizes the same way. Throws 400 on a malformed address.
 */
export function normalizeWallet(raw: string): string {
  if (!isAddress(raw)) {
    throw new BadRequestException(`Invalid wallet address: ${raw}`);
  }
  // getAddress throws on a bad EIP-55 checksum for mixed-case input; normalize to lowercase.
  return getAddress(raw).toLowerCase();
}

/** Lowercased address branded as viem `Hex` for on-chain reads. */
export function toHexAddress(raw: string): Hex {
  return getAddress(raw).toLowerCase() as Hex;
}

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

/** Validate a bytes32 claim/execution id. Throws 400 on a malformed value. */
export function validateBytes32(raw: string, label: string): Hex {
  if (!BYTES32_RE.test(raw)) {
    throw new BadRequestException(`Invalid ${label} (expected 0x + 64 hex chars): ${raw}`);
  }
  return raw as Hex;
}
