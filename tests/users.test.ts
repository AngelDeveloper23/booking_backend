import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createUserAndLogin, authHeader } from './helpers';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('admin user management', () => {
  it('blocks non-admins from listing users', async () => {
    const { token } = await createUserAndLogin(app, 'STAFF');
    const res = await request(app).get('/api/users').set(authHeader(token));
    expect(res.status).toBe(403);
  });

  it('lets an Admin list users without exposing password hashes', async () => {
    const { token } = await createUserAndLogin(app, 'ADMIN');
    const { user: guest } = await createUserAndLogin(app, 'GUEST');

    const res = await request(app).get('/api/users').set(authHeader(token));
    expect(res.status).toBe(200);
    const found = res.body.users.find((u: { id: string }) => u.id === guest.id);
    expect(found).toBeTruthy();
    expect(found.passwordHash).toBeUndefined();
  });

  it('lets an Admin promote a Guest to Staff', async () => {
    const { token } = await createUserAndLogin(app, 'ADMIN');
    const { user: guest } = await createUserAndLogin(app, 'GUEST');

    const res = await request(app)
      .patch(`/api/users/${guest.id}/role`)
      .set(authHeader(token))
      .send({ role: 'STAFF' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('STAFF');
  });

  it('blocks an Admin from changing their own role', async () => {
    const { token, user } = await createUserAndLogin(app, 'ADMIN');
    const res = await request(app)
      .patch(`/api/users/${user.id}/role`)
      .set(authHeader(token))
      .send({ role: 'GUEST' });
    expect(res.status).toBe(400);
  });
});
