import { apiPost } from '../lib/http.js';

export function KillSwitch() {
  async function stopService() {
    if (!confirm('Move service to idle mode? In live mode this must also close open positions.')) return;
    await apiPost('/trpc/control.stop', undefined);
    alert('Service moved to idle mode.');
  }

  return <button className="danger" onClick={stopService}>Kill Switch</button>;
}
