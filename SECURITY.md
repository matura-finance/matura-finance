# Security Policy

> **⚠️ TESTNET ONLY — NEVER SEND REAL FUNDS.**
> Matura is a BSC-Testnet demo/hackathon MVP. The contracts, keys, and services
> are **demo-grade and unaudited**. `MockUSDT` has no value, the deployer/issuer
> keys are testnet convenience keys, and there is **no mainnet deployment**. Do
> not send real assets to any Matura address and do not reuse any key from this
> project anywhere funds are at stake.

## Scope

In scope for disclosure:

- The P0 contracts (`MockUSDT`, `IssuerRegistry`, `ClaimRegistry`,
  `LiquidityVault`, `VaultRegistry`, `MaturaRouter`, `SettlementManager`) and the
  demo source adapters (`MockFreelanceEscrow`, `MockStream`, `SourceObligor`).
- The `apps/api` orchestration + read-model service and its indexer worker
  (auth, route preparation, projections).
- The `apps/app` product frontend and the `apps/landing` marketing site.

Out of scope (accepted risks / by design — see the threat model):

- Anything requiring real funds or a mainnet deployment (there is none).
- Admin-key malice with the single testnet deployer key, absence of
  multisig/timelock, the intentionally-permissionless settlement payer, and the
  intentionally-non-pausable `SettlementManager`.
- `SourceObligor` pooled cross-claim accounting (documented demo behavior).
- Denial-of-service that requires privileged roles or assumes a horizontally
  scaled deployment (rate limiting is single-instance in-memory).

The full trust model, mitigations, and accepted-risk list live in
[`docs/threat-model.md`](docs/threat-model.md).

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** — do not open a public
issue for anything security-relevant until it has been addressed.

- **Email:** `<SECURITY_CONTACT_EMAIL — maintainer: fill in before publishing>`
  (placeholder — no real address is committed here).
- Include: affected component + version/commit, reproduction steps or a proof of
  concept, and the impact you observed.
- Please do **not** run tests against any shared/live testnet deployment in a way
  that would disrupt a demo; prefer a local stack (`hardhat node` +
  `demo:local`).

We will acknowledge the report and work with you on a fix and disclosure timing.

## No bug bounty

This is an unfunded demo/hackathon project. **There is no bug bounty and no
monetary reward** for disclosures. We appreciate responsible reports regardless.

## Supported versions

Only the `main` branch is maintained. There are no long-term support branches or
security backports.
