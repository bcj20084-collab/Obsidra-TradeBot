export function weightedAverage(fills: Array<{ qty: number; price: number }>): number {
  const qty = fills.reduce((sum, fill) => sum + fill.qty, 0);
  return qty ? fills.reduce((sum, fill) => sum + fill.qty * fill.price, 0) / qty : 0;
}
