import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Express } from 'express';
import { prisma } from '../src/lib/prisma';
import { Role } from '../src/types/domain';

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

// Public registration always creates GUEST accounts (see auth.controller.ts),
// so Staff/Admin fixtures are inserted directly and then logged in through
// the real API to get a token exercised the same way the frontend would.
export async function createUserAndLogin(app: Express, role: Role = 'GUEST') {
  const email = `${unique(role.toLowerCase())}@test.local`;
  const password = 'Password123!';
  const passwordHash = await bcrypt.hash(password, 4);

  const user = await prisma.user.create({
    data: { email, passwordHash, name: `${role} Test`, role },
  });

  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Failed to log in fixture user: ${JSON.stringify(res.body)}`);
  }

  return { user, token: res.body.token as string };
}

export async function createRoom(overrides: Partial<{
  name: string;
  type: string;
  capacity: number;
  pricePerNight: number;
  isActive: boolean;
}> = {}) {
  return prisma.room.create({
    data: {
      name: overrides.name ?? unique('Room'),
      type: overrides.type ?? 'Double',
      capacity: overrides.capacity ?? 2,
      pricePerNight: overrides.pricePerNight ?? 100,
      isActive: overrides.isActive ?? true,
    },
  });
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
