import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './server.js';

describe('API (Express)', () => {
  it('GET /api/health responde JSON com status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(['ok', 'degraded']).toContain(res.body.status);
  });
});
