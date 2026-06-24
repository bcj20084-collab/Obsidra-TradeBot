const logs = [
  { ts: 'boot', level: 'info', message: 'Dashboard ready' },
  { ts: 'paper', level: 'info', message: 'Paper mode enabled' },
];

export function LogViewer() {
  return <div className="logs">{logs.map((log) => <div key={`${log.ts}-${log.message}`}><span>{log.ts}</span><strong>{log.level}</strong><p>{log.message}</p></div>)}</div>;
}
