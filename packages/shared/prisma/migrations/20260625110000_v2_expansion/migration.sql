ALTER TABLE "Trade" ADD COLUMN "closeReason" TEXT;
ALTER TABLE "DailyMetrics" ADD COLUMN "symbol" TEXT NOT NULL DEFAULT 'ALL';
DROP INDEX IF EXISTS "DailyMetrics_date_key";
CREATE UNIQUE INDEX "DailyMetrics_date_symbol_key" ON "DailyMetrics"("date", "symbol");

ALTER TABLE "MlWeights" ADD COLUMN "symbol" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "MlWeights" ADD COLUMN "bias" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "MlWeights" ADD COLUMN "cvAccuracy" DOUBLE PRECISION;
ALTER TABLE "MlWeights" ADD COLUMN "cvLogLoss" DOUBLE PRECISION;
ALTER TABLE "MlWeights" ADD COLUMN "wfEfficiency" DOUBLE PRECISION;

ALTER TABLE "AdaptiveLog" ADD COLUMN "symbol" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "BotEvent" ADD COLUMN "symbol" TEXT;

CREATE TABLE "HistoricalCandle" (
  "id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "interval" TEXT NOT NULL,
  "openTime" BIGINT NOT NULL,
  "open" DOUBLE PRECISION NOT NULL,
  "high" DOUBLE PRECISION NOT NULL,
  "low" DOUBLE PRECISION NOT NULL,
  "close" DOUBLE PRECISION NOT NULL,
  "volume" DOUBLE PRECISION NOT NULL,
  "turnover" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "HistoricalCandle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HistoricalCandle_symbol_interval_openTime_key" ON "HistoricalCandle"("symbol", "interval", "openTime");
CREATE INDEX "HistoricalCandle_symbol_interval_openTime_idx" ON "HistoricalCandle"("symbol", "interval", "openTime");

CREATE TABLE "MlTrainingLog" (
  "id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "tradeCount" INTEGER NOT NULL,
  "cvAccuracy" DOUBLE PRECISION NOT NULL,
  "cvLogLoss" DOUBLE PRECISION NOT NULL,
  "wfEfficiency" DOUBLE PRECISION NOT NULL,
  "featureImportance" JSONB NOT NULL,
  "savedWeights" BOOLEAN NOT NULL,
  "rejectReason" TEXT,
  "trainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MlTrainingLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BacktestResult" (
  "id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "metrics" JSONB NOT NULL,
  "equityCurve" JSONB NOT NULL,
  "trades" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BacktestResult_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BacktestResult_symbol_createdAt_idx" ON "BacktestResult"("symbol", "createdAt");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
