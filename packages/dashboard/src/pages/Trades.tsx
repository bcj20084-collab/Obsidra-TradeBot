import { CsvPreview } from '../components/CsvPreview.js';
import { TradeTable } from '../components/TradeTable.js';

export function Trades() {
  return <section className="panel"><h2>Trades</h2><TradeTable /><CsvPreview /></section>;
}
