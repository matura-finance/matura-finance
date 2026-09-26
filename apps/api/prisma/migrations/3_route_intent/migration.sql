-- CreateEnum
CREATE TYPE "RouteIntentStatus" AS ENUM ('PENDING', 'CONSUMED', 'FAILED');

-- CreateTable
CREATE TABLE "RouteIntent" (
    "routeId" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "status" "RouteIntentStatus" NOT NULL DEFAULT 'PENDING',
    "targetAdvance" TEXT NOT NULL,
    "maxTotalFace" TEXT,
    "maxTotalCost" TEXT,
    "totalAdvance" TEXT NOT NULL,
    "totalFaceAssigned" TEXT NOT NULL,
    "totalCost" TEXT NOT NULL,
    "effectiveDiscountBps" INTEGER NOT NULL,
    "legs" JSONB NOT NULL,
    "rejected" JSONB NOT NULL,
    "explanation" JSONB NOT NULL,
    "quoteSnapshotHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "routeDeadlineSeconds" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteIntent_pkey" PRIMARY KEY ("routeId")
);

-- CreateIndex
CREATE INDEX "RouteIntent_expiresAt_idx" ON "RouteIntent"("expiresAt");

