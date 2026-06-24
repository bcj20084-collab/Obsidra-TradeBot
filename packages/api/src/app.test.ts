import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('api app', () => {
  it('returns health ok', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects protected trpc routes without cookie', async () => {
    const res = await request(createApp()).get('/trpc/control.status');
    expect(res.status).toBe(401);
  });
});
