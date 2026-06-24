import { EquityCurve } from '../components/EquityCurve.js';
import { LiveTicker } from '../components/LiveTicker.js';
import { MetricsCards } from '../components/MetricsCards.js';

export function Overview() {
  return <section className="panel"><h2>Overview</h2><LiveTicker /><MetricsCards /><EquityCurve /></section>;
}
