export function calculateOrderQuantity(positionSizeUsdt: number, leverage: number, entryPrice: number): number {
  if (positionSizeUsdt <= 0 || leverage <= 0 || entryPrice <= 0) return 0;
  return Number(((positionSizeUsdt * leverage) / entryPrice).toFixed(6));
}
