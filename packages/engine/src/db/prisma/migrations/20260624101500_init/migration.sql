CREATE TABLE "Trade" (
  "id" TEXT NOT NULL,
  "bybitOrderId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "entryPrice" DOUBLE PRECISION,
  "exitPrice" DOUBLE PRECISION,
  "stopLoss" DOUBLE PRECISION NOT NULL,
  "takeProfit" DOUBLE PRECISION NOT NULL,
  "positionSizeUsdt" DOUBLE PRECISION NOT NULL,
  "leverage" INTEGER NOT NULL,
  "pnlUsdt" DOUBLE PRECISION,
  "pnlPct" DOUBLE PRECISION,
  "feeUsdt" DOUBLE PRECISION,
  "slippage" DOUBLE PRECISION,
  "holdTimeSeconds" INTEGER,
  "signalScore" INTEGER NOT NULL,
  "signalData" JSONB NOT NULL,
  "mlScore" DOUBLE PRECISION,
  "marketRegime" TEXT,
  "openedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Trade_bybitOrderId_key" ON "Trade"("bybitOrderId");
CREATE INDEX "Trade_symbol_status_idx" ON "Trade"("symbol", "status");
CREATE INDEX "Trade_closedAt_idx" ON "Trade"("closedAt");
CREATE INDEX "Trade_createdAt_idx" ON "Trade"("createdAt");

CREATE TABLE "DailyMetrics" (
  "id" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "pnlUsdt" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tradeCount" INTEGER NOT NULL DEFAULT 0,
  "winCount" INTEGER NOT NULL DEFAULT 0,
  "feesUsdt" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "equityEnd" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyMetrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyMetrics_date_key" ON "DailyMetrics"("date");

CREATE TABLE "MlWeights" (
  "id" TEXT NOT NULL,
  "weights" JSONB NOT NULL,
  "trainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tradeCount" INTEGER NOT NULL,
  CONSTRAINT "MlWeights_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdaptiveLog" (
  "id" TEXT NOT NULL,
  "regime" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdaptiveLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BotEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BotEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BotEvent_type_createdAt_idx" ON "BotEvent"("type", "createdAt");
