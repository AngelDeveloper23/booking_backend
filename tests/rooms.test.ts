import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createRoom, createUserAndLogin, authHeader, daysFromNow } from './helpers';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('room search and availability', () => {
  it('excludes a room with an overlapping confirmed reservation', async () => {
    const room = await createRoom({ capacity: 2 });
    const { user } = await createUserAndLogin(app, 'GUEST');
    await prisma.reservation.create({
      data: { roomId: room.id, userId: user.id, checkIn: daysFromNow(5), checkOut: daysFromNow(8), guests: 2 },
    });

    const res = await request(app).get('/api/rooms/search').query({
      checkIn: daysFromNow(6).toISOString(),
      checkOut: daysFromNow(7).toISOString(),
      guests: 2,
    });

    expect(res.status).toBe(200);
    expect(res.body.rooms.map((r: { id: string }) => r.id)).not.toContain(room.id);
  });

  it('includes the room again for dates outside the reservation', async () => {
    const room = await createRoom({ capacity: 2 });
    const { user } = await createUserAndLogin(app, 'GUEST');
    await prisma.reservation.create({
      data: { roomId: room.id, userId: user.id, checkIn: daysFromNow(5), checkOut: daysFromNow(8), guests: 2 },
    });

    const res = await request(app).get('/api/rooms/search').query({
      checkIn: daysFromNow(10).toISOString(),
      checkOut: daysFromNow(11).toISOString(),
      guests: 2,
    });

    expect(res.status).toBe(200);
    expect(res.body.rooms.map((r: { id: string }) => r.id)).toContain(room.id);
  });

  it('excludes rooms below the requested guest count', async () => {
    const room = await createRoom({ capacity: 1 });
    const res = await request(app).get('/api/rooms/search').query({ guests: 2 });
    expect(res.body.rooms.map((r: { id: string }) => r.id)).not.toContain(room.id);
  });

  it('reports booked days in the availability calendar', async () => {
    const room = await createRoom();
    const { user } = await createUserAndLogin(app, 'GUEST');
    const checkIn = daysFromNow(3);
    const checkOut = daysFromNow(5); // books day 3 and day 4, not day 5 (checkout day is free)
    await prisma.reservation.create({ data: { roomId: room.id, userId: user.id, checkIn, checkOut, guests: 1 } });

    const res = await request(app)
      .get(`/api/rooms/${room.id}/availability`)
      .query({ year: checkIn.getUTCFullYear(), month: checkIn.getUTCMonth() + 1 });

    expect(res.status).toBe(200);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    expect(res.body.unavailableDates).toContain(iso(checkIn));
    expect(res.body.unavailableDates).not.toContain(iso(checkOut));
  });

  it('lets an Admin create, update, and soft-delete a room; blocks a Guest from creating one', async () => {
    const { token: adminToken } = await createUserAndLogin(app, 'ADMIN');
    const { token: guestToken } = await createUserAndLogin(app, 'GUEST');

    const blocked = await request(app)
      .post('/api/rooms')
      .set(authHeader(guestToken))
      .send({ name: 'Nope', type: 'Suite', capacity: 2, pricePerNight: 10 });
    expect(blocked.status).toBe(403);

    const created = await request(app)
      .post('/api/rooms')
      .set(authHeader(adminToken))
      .send({ name: 'New Room', type: 'Suite', capacity: 2, pricePerNight: 300 });
    expect(created.status).toBe(201);

    const updated = await request(app)
      .put(`/api/rooms/${created.body.room.id}`)
      .set(authHeader(adminToken))
      .send({ pricePerNight: 250 });
    expect(updated.body.room.pricePerNight).toBe(250);

    const deleted = await request(app)
      .delete(`/api/rooms/${created.body.room.id}`)
      .set(authHeader(adminToken));
    expect(deleted.body.room.isActive).toBe(false);

    const publicList = await request(app).get('/api/rooms');
    expect(publicList.body.rooms.map((r: { id: string }) => r.id)).not.toContain(created.body.room.id);
  });
});
