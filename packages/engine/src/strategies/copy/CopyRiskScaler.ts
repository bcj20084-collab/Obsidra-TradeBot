export function scaleCopyPosition(size: number, price: number, ratioPct: number, maxSize: number, leverage: number, maxLeverage: number) {
  return { positionUsdt: Math.min(size * price * ratioPct / 100, maxSize), leverage: Math.min(leverage, maxLeverage) };
}
