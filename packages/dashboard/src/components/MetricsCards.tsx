const cards = ['Win Rate', 'Profit Factor', 'Sharpe', 'Max DD', 'Trades 24h', 'Fees'];
export function MetricsCards() { return <div className="grid">{cards.map((x) => <div className="card" key={x}><span>{x}</span><strong>0</strong></div>)}</div>; }
