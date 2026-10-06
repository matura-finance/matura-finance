-- Sort-covering index for the issuer-scoped claims read (GET /claims/issued), which filters by
-- issuer and orders by (blockNumber desc, logIndex desc). Mirrors the existing beneficiary index.

-- CreateIndex
CREATE INDEX "ClaimProjection_issuer_blockNumber_logIndex_idx" ON "ClaimProjection"("issuer", "blockNumber", "logIndex");
