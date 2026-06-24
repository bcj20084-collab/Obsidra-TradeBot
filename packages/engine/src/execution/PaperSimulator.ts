import type { RiskDecision } from '../risk/RiskEngine.js';
import type { SignalResult } from '../signals/types.js';

export interface SimulatedFill {
  fillPrice: number;
  feeUsdt: number;
  filledAt: Date;
}

export class PaperSimulator {
  simulate(signal: SignalResult, risk: RiskDecision): SimulatedFill {
    const notional = Math.max(risk.positionSizeUsdt, 0);
    return {
      fillPrice: signal.entryPrice,
      feeUsdt: notional * 0.0006,
      filledAt: new Date(),
    };
  }
}
