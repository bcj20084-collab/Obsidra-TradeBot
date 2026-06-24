import { AdaptiveParamsPanel } from '../components/AdaptiveParamsPanel.js';

export function Strategy() {
  return <section className="panel"><h2>Strategy</h2><span className="badge">NORMAL</span><p>EMA, RSI, MACD, BB, ADX and ATR live values will stream here from the API.</p><AdaptiveParamsPanel /><p>Circuit breaker: inactive</p></section>;
}
