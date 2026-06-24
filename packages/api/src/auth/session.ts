import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const secret = process.env.JWT_SECRET ?? 'change-me-with-32-plus-random-chars';
const password = process.env.DASHBOARD_PASSWORD ?? 'change-me';

export function login(req: Request, res: Response) {
  if (req.body?.password !== password) return res.status(401).json({ ok: false });
  const token = jwt.sign({ sub: 'dashboard' }, secret, { expiresIn: '7d' });
  res.cookie('obsidra_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 });
  return res.json({ ok: true });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try { jwt.verify(req.cookies?.obsidra_session ?? '', secret); next(); } catch { res.status(401).json({ ok: false }); }
}
