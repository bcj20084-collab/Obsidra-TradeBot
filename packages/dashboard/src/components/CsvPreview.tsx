interface Row { [key: string]: string | number | null | undefined; }

function toCsv(rows: Row[]) {
  if (!rows.length) return 'date,symbol,direction,entry,exit,pnl,fee,slippage,score';
  const headers = Object.keys(rows[0] ?? {});
  const escape = (value: unknown) => String(value ?? '').replaceAll(',', ' ');
  return [headers.join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\n');
}

export function CsvPreview({ rows = [] }: { rows?: Row[] }) {
  return <details><summary>CSV export preview</summary><textarea readOnly value={toCsv(rows)} rows={6} /></details>;
}
