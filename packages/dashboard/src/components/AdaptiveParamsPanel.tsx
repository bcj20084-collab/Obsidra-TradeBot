const params = [
  ['Min Score', '65'],
  ['SL Mult', '1.5x ATR'],
  ['TP Mult', '2.5x ATR'],
  ['Max Position', '2%'],
  ['Max Leverage', '5x'],
  ['Trailing Stop', '1.5%'],
];

export function AdaptiveParamsPanel() {
  return <div className="paramGrid">{params.map(([label, value]) => <div className="card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}
