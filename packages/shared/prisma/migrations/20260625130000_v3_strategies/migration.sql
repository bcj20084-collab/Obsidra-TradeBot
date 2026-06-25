ALTER TABLE "Trade" ADD COLUMN "exchange" TEXT NOT NULL DEFAULT 'bybit';
ALTER TABLE "Trade" ADD COLUMN "strategyId" TEXT NOT NULL DEFAULT 'trend';
ALTER TABLE "Trade" ADD COLUMN "exchangeOrderId" TEXT;

CREATE TABLE "GridLevel" (
  "id" TEXT NOT NULL, "strategyId" TEXT NOT NULL, "symbol" TEXT NOT NULL,
  "exchange" TEXT NOT NULL, "levelPrice" DOUBLE PRECISION NOT NULL,
  "orderSizeUsdt" DOUBLE PRECISION NOT NULL, "status" TEXT NOT NULL,
  "exchangeOrderId" TEXT, "profitUsdt" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GridLevel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GridLevel_strategyId_status_idx" ON "GridLevel"("strategyId", "status");

CREATE TABLE "DCAPosition" (
  "id" TEXT NOT NULL, "strategyId" TEXT NOT NULL, "symbol" TEXT NOT NULL,
  "exchange" TEXT NOT NULL, "direction" TEXT NOT NULL, "status" TEXT NOT NULL,
  "averageEntryPrice" DOUBLE PRECISION, "totalQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalInvestedUsdt" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "safetyOrdersFilled" INTEGER NOT NULL DEFAULT 0, "targetPrice" DOUBLE PRECISION,
  "stopLossPrice" DOUBLE PRECISION, "cycleStartedAt" TIMESTAMP(3),
  "cycleClosedAt" TIMESTAMP(3), "cyclePnlUsdt" DOUBLE PRECISION,
  "cooldownEndsAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DCAPosition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CopyTraderPosition" (
  "id" TEXT NOT NULL, "traderId" TEXT NOT NULL, "symbol" TEXT NOT NULL,
  "direction" TEXT NOT NULL, "size" DOUBLE PRECISION NOT NULL,
  "entryPrice" DOUBLE PRECISION NOT NULL, "leverage" INTEGER NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL, "closedAt" TIMESTAMP(3),
  "ourTradeId" TEXT, "skippedReason" TEXT,
  CONSTRAINT "CopyTraderPosition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CopyTraderPosition_traderId_symbol_idx" ON "CopyTraderPosition"("traderId", "symbol");

CREATE TABLE "StrategyMetrics" (
  "id" TEXT NOT NULL, "strategyId" TEXT NOT NULL, "date" TEXT NOT NULL,
  "pnlUsdt" DOUBLE PRECISION NOT NULL DEFAULT 0, "tradeCount" INTEGER NOT NULL DEFAULT 0,
  "winCount" INTEGER NOT NULL DEFAULT 0, "feesUsdt" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "equityEnd" DOUBLE PRECISION NOT NULL, CONSTRAINT "StrategyMetrics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StrategyMetrics_strategyId_date_key" ON "StrategyMetrics"("strategyId", "date");
