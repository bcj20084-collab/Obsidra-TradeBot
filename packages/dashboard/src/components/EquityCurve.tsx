import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Point { date: string; equity: number; }

export function EquityCurve({ data = [] }: { data?: Point[] }) {
  const fallback = data.length ? data : [
    { date: 'D-4', equity: 1000 },
    { date: 'D-3', equity: 1000 },
    { date: 'D-2', equity: 1000 },
    { date: 'D-1', equity: 1000 },
    { date: 'Today', equity: 1000 },
  ];

  return <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={fallback}><XAxis dataKey="date" /><YAxis domain={['auto', 'auto']} /><Tooltip /><Line type="monotone" dataKey="equity" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>;
}
