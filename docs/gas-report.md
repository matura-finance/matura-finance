# Gas Report

Measured on the in-process Hardhat network (evm: cancun, optimizer runs 200).
Regenerate with `pnpm --filter @matura/contracts contracts:test`.

| Operation             | Gas used |
| --------------------- | -------: |
| registerClaim         |   227480 |
| executeRoute (1 leg)  |   360606 |
| executeRoute (2 legs) |   518816 |
| settleClaim (1 vault) |   123420 |
