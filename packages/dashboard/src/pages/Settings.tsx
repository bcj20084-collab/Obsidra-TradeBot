import { useState } from 'react';
import { KillSwitch } from '../components/KillSwitch.js';
import { apiPost } from '../lib/http.js';

export function Settings() {
  const [message, setMessage] = useState('');

  async function pause() { await apiPost('/trpc/control.pause', undefined); setMessage('Paused. New signals are blocked.'); }
  async function resume() { await apiPost('/trpc/control.resume', undefined); setMessage('Running. New signals are allowed.'); }

  return <section className="panel"><h2>Control</h2><div className="actions"><button onClick={pause}>Pause</button><button onClick={resume}>Resume</button><KillSwitch /></div><p>{message}</p><p>Auth uses httpOnly cookies from the API. No localStorage auth.</p></section>;
}
