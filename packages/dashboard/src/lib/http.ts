const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function apiGet(path: string) {
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return response.json();
}

export async function apiPost(path: string, payload: unknown) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return response.json();
}
