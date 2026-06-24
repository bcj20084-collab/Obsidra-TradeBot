import { useState } from 'react';
import { apiPost } from '../lib/http.js';

export function LoginPanel() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function submit() {
    try {
      await apiPost('/auth/login', { password });
      setMessage('Logged in. Refresh metrics now.');
    } catch {
      setMessage('Login failed. Check DASHBOARD_PASSWORD.');
    }
  }

  return <div className="panel small"><h2>Login</h2><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Dashboard password" /><button onClick={submit}>Login</button><p>{message}</p></div>;
}
