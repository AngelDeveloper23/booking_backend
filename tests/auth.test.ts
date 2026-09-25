import { describe, it, expect, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createUserAndLogin, authHeader } from './helpers';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

// The backend "sends" the reset email by logging the link to its own
// console (see auth.controller.ts — no SMTP is configured for this MVP), so
// tests recover the raw token the same way a developer would: from that log
// line, via console.log's real arguments.
function tokenFromResetLink(logMock: ReturnType<typeof vi.spyOn>): string {
  const call = logMock.mock.calls.find((args) => String(args[0]).includes('[password reset]'));
  if (!call) throw new Error('No password reset link was logged');
  const match = String(call[0]).match(/token=([a-f0-9]+)/);
  if (!match) throw new Error('Could not find token in logged reset link');
  return match[1];
}

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

describe('forgot / reset password', () => {
  it('returns the same generic message for a known and an unknown email (no account enumeration)', async () => {
    const { user } = await createUserAndLogin(app, 'GUEST');

    const known = await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `nobody-${Date.now()}@test.local` });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it('resets the password with a valid token, and the old password stops working', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { user } = await createUserAndLogin(app, 'GUEST');

    await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    const rawToken = tokenFromResetLink(logSpy);
    logSpy.mockRestore();

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'NewPassword456!' });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Password123!' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'NewPassword456!' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'not-a-real-token', password: 'NewPassword456!' });
    expect(res.status).toBe(400);
  });

  it('rejects an expired token', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { user } = await createUserAndLogin(app, 'GUEST');

    await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    const rawToken = tokenFromResetLink(logSpy);
    logSpy.mockRestore();

    await prisma.user.update({ where: { id: user.id }, data: { resetTokenExpiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'NewPassword456!' });
    expect(res.status).toBe(400);
  });

  it('makes the token single-use', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { user } = await createUserAndLogin(app, 'GUEST');

    await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    const rawToken = tokenFromResetLink(logSpy);
    logSpy.mockRestore();

    const first = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'NewPassword456!' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'AnotherPassword789!' });
    expect(second.status).toBe(400);
  });
});
