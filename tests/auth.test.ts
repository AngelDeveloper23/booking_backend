import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createUserAndLogin, authHeader } from './helpers';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('auth', () => {
  it('registers a new account as GUEST regardless of any role in the payload', async () => {
    const email = `register-${Date.now()}@test.local`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New Guest', email, password: 'Password123!', role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('GUEST');
    expect(res.body.token).toBeTruthy();
  });

  it('rejects registering the same email twice', async () => {
    const email = `dupe-${Date.now()}@test.local`;
    await request(app).post('/api/auth/register').send({ name: 'A', email, password: 'Password123!' });
    const res = await request(app).post('/api/auth/register').send({ name: 'B', email, password: 'Password123!' });
    expect(res.status).toBe(409);
  });

  it('rejects login with a wrong password', async () => {
    const { user } = await createUserAndLogin(app, 'GUEST');
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects protected routes without a token', async () => {
    const res = await request(app).get('/api/rooms/admin/all');
    expect(res.status).toBe(401);
  });

  it('rejects admin-only routes for a GUEST token', async () => {
    const { token } = await createUserAndLogin(app, 'GUEST');
    const res = await request(app)
      .post('/api/rooms')
      .set(authHeader(token))
      .send({ name: 'X', type: 'Y', capacity: 1, pricePerNight: 1 });
    expect(res.status).toBe(403);
  });

  it('resolves the current user from /auth/me', async () => {
    const { token, user } = await createUserAndLogin(app, 'STAFF');
    const res = await request(app).get('/api/auth/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.role).toBe('STAFF');
  });
});
