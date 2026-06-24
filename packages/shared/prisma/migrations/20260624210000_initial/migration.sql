-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "clientOrderId" TEXT NOT NULL,
    "bybitOrderId" TEXT,
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

CREATE TABLE "OrderTransition" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyMetrics" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "pnlUsdt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "winCount" INTEGER NOT NULL DEFAULT 0,
    "feesUsdt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equityEnd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyMetrics_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "BotState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "status" TEXT NOT NULL DEFAULT 'STOPPED',
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BotState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Trade_clientOrderId_key" ON "Trade"("clientOrderId");
CREATE UNIQUE INDEX "Trade_bybitOrderId_key" ON "Trade"("bybitOrderId");
CREATE INDEX "Trade_status_symbol_idx" ON "Trade"("status", "symbol");
CREATE INDEX "Trade_closedAt_idx" ON "Trade"("closedAt");
CREATE INDEX "OrderTransition_tradeId_createdAt_idx" ON "OrderTransition"("tradeId", "createdAt");
CREATE INDEX "JournalEntry_type_createdAt_idx" ON "JournalEntry"("type", "createdAt");
CREATE UNIQUE INDEX "DailyMetrics_date_key" ON "DailyMetrics"("date");

ALTER TABLE "OrderTransition"
ADD CONSTRAINT "OrderTransition_tradeId_fkey"
FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JournalEntry"
ADD CONSTRAINT "JournalEntry_tradeId_fkey"
FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
