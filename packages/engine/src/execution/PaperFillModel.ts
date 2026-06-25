export interface PaperFill {
  fillPrice: number;
  filledQty: number;
  feeUsdt: number;
}

export function calculatePaperMarketFill(params: {
  side: "Buy" | "Sell";
  qty: number;
  bid: number;
  ask: number;
  feeRate: number;
  slippageBps: number;
}): PaperFill {
  const { side, qty, bid, ask, feeRate, slippageBps } = params;
  if (qty <= 0 || bid <= 0 || ask <= 0 || ask < bid || feeRate < 0 || slippageBps < 0) {
    throw new Error("Invalid paper fill inputs");
  }
  const slippage = slippageBps / 10_000;
  const touchPrice = side === "Buy" ? ask : bid;
  const fillPrice = touchPrice * (side === "Buy" ? 1 + slippage : 1 - slippage);
  return {
    fillPrice,
    filledQty: qty,
    feeUsdt: fillPrice * qty * feeRate,
  };
}
