export interface SymbolConfig {
  symbol: string;
  weight: number;
  enabled: boolean;
}

export class SymbolRegistry {
  private readonly configs = new Map<string, SymbolConfig>();

  constructor(symbols: string[], env: NodeJS.ProcessEnv = process.env) {
    if (symbols.length > 5) throw new Error("At most five symbols are supported");
    for (const symbol of symbols) {
      this.configs.set(symbol, { symbol, weight: Number(env[`SYMBOL_WEIGHT_${symbol}`] ?? 100 / symbols.length), enabled: true });
    }
    if ([...this.configs.values()].reduce((sum, config) => sum + config.weight, 0) > 100.001) throw new Error("Symbol weights exceed 100%");
  }

  list(): SymbolConfig[] {
    return [...this.configs.values()];
  }

  setEnabled(symbol: string, enabled: boolean): void {
    const config = this.configs.get(symbol);
    if (config) config.enabled = enabled;
  }
}
