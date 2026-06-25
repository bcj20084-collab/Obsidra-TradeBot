ALTER TABLE "Trade"
ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'PAPER';

CREATE INDEX "Trade_executionMode_closedAt_idx"
ON "Trade"("executionMode", "closedAt");
