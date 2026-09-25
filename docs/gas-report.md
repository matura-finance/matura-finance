# Gas Report

Measured on the in-process Hardhat network (evm: cancun, optimizer runs 200).
Regenerate with `pnpm --filter @matura/contracts contracts:test`.

| Operation             | Gas used |
| --------------------- | -------: |
| registerClaim         |   232575 |
| executeRoute (1 leg)  |   369158 |
| executeRoute (2 legs) |   534526 |
| settleClaim (1 vault) |   126553 |
