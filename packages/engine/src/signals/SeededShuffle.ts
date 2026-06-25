export function deterministicShuffle<T>(items: T[], seed: number): T[] {
  const shuffled = [...items];
  let state = (seed * 1_664_525 + 1_013_904_223) >>> 0;
  const random = (): number => {
    state = (state ^ (state >>> 16)) >>> 0;
    state = Math.imul(state, 0x45d9f3b) >>> 0;
    state = (state ^ (state >>> 16)) >>> 0;
    return state / 0x1_0000_0000;
  };
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}
