-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('PAYROLL', 'FREELANCE_ESCROW', 'STREAM');

-- CreateEnum
CREATE TYPE "ClaimState" AS ENUM ('ATTESTED', 'ELIGIBLE', 'PARTIALLY_FUNDED', 'FUNDED', 'MATURED', 'PAID', 'DELAYED', 'DISPUTED', 'DEFAULTED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('PENDING', 'EXECUTED', 'FAILED');

-- CreateTable
CREATE TABLE "UserWallet" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuerProjection" (
    "id" TEXT NOT NULL,
    "chainIssuerId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "signer" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedBlock" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "IssuerProjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimProjection" (
    "claimId" TEXT NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "token" TEXT NOT NULL,
    "faceValue" TEXT NOT NULL,
    "financedFaceValue" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "state" "ClaimState" NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimProjection_pkey" PRIMARY KEY ("claimId")
);

-- CreateTable
CREATE TABLE "RouteExecution" (
    "executionId" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "targetAdvance" TEXT NOT NULL,
    "totalAdvance" TEXT NOT NULL,
    "totalFaceAssigned" TEXT NOT NULL,
    "totalCost" TEXT NOT NULL,
    "status" "RouteStatus" NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteExecution_pkey" PRIMARY KEY ("executionId")
);

-- CreateTable
CREATE TABLE "RouteLegProjection" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "faceAmount" TEXT NOT NULL,
    "advanceAmount" TEXT NOT NULL,
    "discountAmount" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "RouteLegProjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainCursor" (
    "consumerName" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "lastProcessedBlock" BIGINT NOT NULL,
    "lastProcessedBlockHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainCursor_pkey" PRIMARY KEY ("consumerName","chainId")
);

-- CreateTable
CREATE TABLE "SettlementProjection" (
    "claimId" TEXT NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "amountReceived" TEXT NOT NULL,
    "vaultDistribution" TEXT NOT NULL,
    "userResidual" TEXT NOT NULL,
    "protocolFee" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementProjection_pkey" PRIMARY KEY ("claimId")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "claimId" TEXT,
    "executionId" TEXT,
    "payload" JSONB NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "nonce" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserWallet_address_key" ON "UserWallet"("address");

-- CreateIndex
CREATE INDEX "IssuerProjection_address_idx" ON "IssuerProjection"("address");

-- CreateIndex
CREATE UNIQUE INDEX "IssuerProjection_chainIssuerId_key" ON "IssuerProjection"("chainIssuerId");

-- CreateIndex
CREATE INDEX "ClaimProjection_beneficiary_idx" ON "ClaimProjection"("beneficiary");

-- CreateIndex
CREATE INDEX "ClaimProjection_issuer_idx" ON "ClaimProjection"("issuer");

-- CreateIndex
CREATE INDEX "ClaimProjection_state_dueAt_idx" ON "ClaimProjection"("state", "dueAt");

-- CreateIndex
CREATE INDEX "ClaimProjection_beneficiary_state_idx" ON "ClaimProjection"("beneficiary", "state");

-- CreateIndex
CREATE INDEX "ClaimProjection_issuer_state_idx" ON "ClaimProjection"("issuer", "state");

-- CreateIndex
CREATE INDEX "ClaimProjection_beneficiary_blockNumber_logIndex_idx" ON "ClaimProjection"("beneficiary", "blockNumber", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimProjection_txHash_logIndex_key" ON "ClaimProjection"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "RouteExecution_user_idx" ON "RouteExecution"("user");

-- CreateIndex
CREATE INDEX "RouteExecution_user_blockNumber_logIndex_idx" ON "RouteExecution"("user", "blockNumber", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "RouteExecution_txHash_logIndex_key" ON "RouteExecution"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "RouteLegProjection_executionId_idx" ON "RouteLegProjection"("executionId");

-- CreateIndex
CREATE INDEX "RouteLegProjection_claimId_idx" ON "RouteLegProjection"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteLegProjection_executionId_claimId_key" ON "RouteLegProjection"("executionId", "claimId");

-- CreateIndex
CREATE INDEX "SettlementProjection_beneficiary_idx" ON "SettlementProjection"("beneficiary");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementProjection_txHash_logIndex_key" ON "SettlementProjection"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "ActivityEvent_wallet_blockNumber_logIndex_idx" ON "ActivityEvent"("wallet", "blockNumber", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_txHash_logIndex_wallet_key" ON "ActivityEvent"("txHash", "logIndex", "wallet");

-- CreateIndex
CREATE INDEX "AuthNonce_expiresAt_idx" ON "AuthNonce"("expiresAt");

-- AddForeignKey
ALTER TABLE "RouteLegProjection" ADD CONSTRAINT "RouteLegProjection_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "RouteExecution"("executionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteLegProjection" ADD CONSTRAINT "RouteLegProjection_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ClaimProjection"("claimId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementProjection" ADD CONSTRAINT "SettlementProjection_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ClaimProjection"("claimId") ON DELETE CASCADE ON UPDATE CASCADE;

