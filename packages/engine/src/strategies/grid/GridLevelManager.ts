export interface GridLevel { price: number; orderSizeUsdt: number; side: "Buy" | "Sell" }
export function calculateGridLevels(lower: number, upper: number, count: number, total: number, current: number): GridLevel[] {
  if (count < 5 || count > 50 || lower >= upper) throw new Error("Invalid grid configuration");
  const spacing = (upper - lower) / (count - 1);
  return Array.from({ length: count }, (_, index) => {
    const price = lower + spacing * index;
    return { price, orderSizeUsdt: total / count, side: price < current ? "Buy" : "Sell" };
  });
}
