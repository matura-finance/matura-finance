# Gas Report

Measured on the in-process Hardhat network (evm: cancun, optimizer runs 200).
Regenerate with `pnpm --filter @matura/contracts contracts:test`.

| Operation             | Gas used |
| --------------------- | -------: |
| registerClaim         |   232587 |
| executeRoute (1 leg)  |   369146 |
| executeRoute (2 legs) |   534526 |
| settleClaim (1 vault) |   126553 |
