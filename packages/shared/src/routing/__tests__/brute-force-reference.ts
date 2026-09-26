import type { OptimizeInput } from "../optimize-io.js";

/**
 * Independent, obviously-correct reference optimizer for property testing. It
 * exhaustively enumerates every per-candidate face assignment (0, or any integer
 * in [minFace, maxFace]) and returns the minimum total cost that satisfies every
 * constraint. Deliberately uses its OWN ceil-discount arithmetic (a different
 * expression from `arithmetic.ts`) to avoid oracle anchoring, and no greedy — so
 * it can only disagree with the optimizer if the optimizer is genuinely wrong.
 *
 * Exponential in candidate count × face range: callers MUST keep portfolios tiny
 * (few candidates, small maxFace).
 */
export interface ReferenceResult {
  cost: bigint;
  advance: bigint;
  face: bigint;
}

/** Independent advance formula: face − ⌈face·bps/10000⌉ (distinct from arithmetic.ts). */
function refAdvance(face: bigint, bps: number): bigint {
  const num = face * BigInt(bps);
  const discount = (num + 9_999n) / 10_000n; // ceil, independently written
  return face - discount;
}

export function referenceMinCost(input: OptimizeInput): ReferenceResult | null {
  const cands = input.candidates;
  const target = BigInt(input.targetAdvance);
  const maxLegs = input.maxLegs;
  const maxFace = input.maxTotalFace !== undefined ? BigInt(input.maxTotalFace) : null;
  const maxCost = input.maxTotalCost !== undefined ? BigInt(input.maxTotalCost) : null;

  // Face options per candidate: 0 (unused) or any integer lot in [minFace, maxFace].
  const options: bigint[][] = cands.map((c) => {
    const opts: bigint[] = [0n];
    for (let f = BigInt(c.minFace); f <= BigInt(c.maxFace); f++) opts.push(f);
    return opts;
  });

  let best: ReferenceResult | null = null;
  const chosen: bigint[] = new Array<bigint>(cands.length).fill(0n);

  const evaluate = (): void => {
    const usedClaims = new Set<string>();
    const vaultAdvance = new Map<string, bigint>();
    let legs = 0;
    let totalAdvance = 0n;
    let totalCost = 0n;
    let totalFace = 0n;
    for (let i = 0; i < cands.length; i++) {
      const f = chosen[i];
      const c = cands[i];
      if (f === undefined || c === undefined || f === 0n) continue;
      if (usedClaims.has(c.claimId)) return; // one vault per claim
      usedClaims.add(c.claimId);
      legs++;
      const adv = refAdvance(f, c.rateBps);
      totalAdvance += adv;
      totalCost += f - adv;
      totalFace += f;
      vaultAdvance.set(c.vault, (vaultAdvance.get(c.vault) ?? 0n) + adv);
    }
    if (legs === 0 || legs > maxLegs) return;
    for (const [vault, adv] of vaultAdvance) {
      const cand = cands.find((x) => x.vault === vault);
      if (cand && adv > BigInt(cand.vaultFundable)) return;
    }
    if (totalAdvance < target) return;
    if (maxFace !== null && totalFace > maxFace) return;
    if (maxCost !== null && totalCost > maxCost) return;
    if (
      best === null ||
      totalCost < best.cost ||
      (totalCost === best.cost && totalFace < best.face)
    ) {
      best = { cost: totalCost, advance: totalAdvance, face: totalFace };
    }
  };

  const rec = (i: number): void => {
    if (i === cands.length) {
      evaluate();
      return;
    }
    const opts = options[i];
    if (!opts) return;
    for (const f of opts) {
      chosen[i] = f;
      rec(i + 1);
    }
    chosen[i] = 0n;
  };
  rec(0);

  return best;
}
