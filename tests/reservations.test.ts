import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createRoom, createUserAndLogin, authHeader, daysFromNow } from './helpers';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('reservation booking flow', () => {
  it('lets a Guest book an available room', async () => {
    const room = await createRoom({ capacity: 2 });
    const { token } = await createUserAndLogin(app, 'GUEST');

    const res = await request(app)
      .post('/api/reservations')
      .set(authHeader(token))
      .send({
        roomId: room.id,
        checkIn: daysFromNow(2).toISOString(),
        checkOut: daysFromNow(4).toISOString(),
        guests: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.reservation.status).toBe('CONFIRMED');
    expect(res.body.reservation.room.id).toBe(room.id);
  });

  it('rejects a booking that overlaps an existing confirmed reservation', async () => {
    const room = await createRoom({ capacity: 2 });
    const { token: guestA } = await createUserAndLogin(app, 'GUEST');
    const { token: guestB } = await createUserAndLogin(app, 'GUEST');

    const first = await request(app)
      .post('/api/reservations')
      .set(authHeader(guestA))
      .send({ roomId: room.id, checkIn: daysFromNow(20).toISOString(), checkOut: daysFromNow(25).toISOString(), guests: 2 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/reservations')
      .set(authHeader(guestB))
      .send({ roomId: room.id, checkIn: daysFromNow(22).toISOString(), checkOut: daysFromNow(23).toISOString(), guests: 2 });
    expect(second.status).toBe(409);
  });

  it('rejects a booking above room capacity, in the past, or for an inactive room', async () => {
    const room = await createRoom({ capacity: 1, isActive: false });
    const { token } = await createUserAndLogin(app, 'GUEST');

    const inactive = await request(app)
      .post('/api/reservations')
      .set(authHeader(token))
      .send({ roomId: room.id, checkIn: daysFromNow(2).toISOString(), checkOut: daysFromNow(3).toISOString(), guests: 1 });
    expect(inactive.status).toBe(404);

    const activeRoom = await createRoom({ capacity: 1 });
    const tooManyGuests = await request(app)
      .post('/api/reservations')
      .set(authHeader(token))
      .send({ roomId: activeRoom.id, checkIn: daysFromNow(2).toISOString(), checkOut: daysFromNow(3).toISOString(), guests: 5 });
    expect(tooManyGuests.status).toBe(400);

    const pastDate = await request(app)
      .post('/api/reservations')
      .set(authHeader(token))
      .send({ roomId: activeRoom.id, checkIn: daysFromNow(-5).toISOString(), checkOut: daysFromNow(-3).toISOString(), guests: 1 });
    expect(pastDate.status).toBe(400);
  });

  it('blocks Staff/Admin from booking through the guest endpoint', async () => {
    const room = await createRoom();
    const { token } = await createUserAndLogin(app, 'STAFF');
    const res = await request(app)
      .post('/api/reservations')
      .set(authHeader(token))
      .send({ roomId: room.id, checkIn: daysFromNow(2).toISOString(), checkOut: daysFromNow(3).toISOString(), guests: 1 });
    expect(res.status).toBe(403);
  });

  it('never lets two concurrent overlapping bookings for the same room both succeed', async () => {
    const room = await createRoom({ capacity: 4 });
    const { token: guestA } = await createUserAndLogin(app, 'GUEST');
    const { token: guestB } = await createUserAndLogin(app, 'GUEST');

    const checkIn = daysFromNow(40).toISOString();
    const checkOut = daysFromNow(43).toISOString();

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/reservations')
        .set(authHeader(guestA))
        .send({ roomId: room.id, checkIn, checkOut, guests: 1 }),
      request(app)
        .post('/api/reservations')
        .set(authHeader(guestB))
        .send({ roomId: room.id, checkIn, checkOut, guests: 1 }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const confirmedCount = await prisma.reservation.count({
      where: { roomId: room.id, status: 'CONFIRMED', checkIn: new Date(checkIn) },
    });
    expect(confirmedCount).toBe(1);
  });

  it('lets a Guest view only their own reservations', async () => {
    const room = await createRoom();
    const { token: guestA } = await createUserAndLogin(app, 'GUEST');
    const { token: guestB } = await createUserAndLogin(app, 'GUEST');

    await request(app)
      .post('/api/reservations')
      .set(authHeader(guestA))
      .send({ roomId: room.id, checkIn: daysFromNow(60).toISOString(), checkOut: daysFromNow(61).toISOString(), guests: 1 });

    const mineA = await request(app).get('/api/reservations/mine').set(authHeader(guestA));
    const mineB = await request(app).get('/api/reservations/mine').set(authHeader(guestB));

    expect(mineA.body.reservations.length).toBeGreaterThan(0);
    expect(mineB.body.reservations).toHaveLength(0);
  });

  it('lets Staff/Admin list every reservation but blocks Guests from that endpoint', async () => {
    const { token: guestToken } = await createUserAndLogin(app, 'GUEST');
    const { token: staffToken } = await createUserAndLogin(app, 'STAFF');

    const blocked = await request(app).get('/api/reservations').set(authHeader(guestToken));
    expect(blocked.status).toBe(403);

    const allowed = await request(app).get('/api/reservations').set(authHeader(staffToken));
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.reservations)).toBe(true);
  });

  it('lets the owning Guest cancel their reservation, and blocks other Guests from cancelling it', async () => {
    const room = await createRoom();
    const { token: owner } = await createUserAndLogin(app, 'GUEST');
    const { token: stranger } = await createUserAndLogin(app, 'GUEST');

    const created = await request(app)
      .post('/api/reservations')
      .set(authHeader(owner))
      .send({ roomId: room.id, checkIn: daysFromNow(70).toISOString(), checkOut: daysFromNow(71).toISOString(), guests: 1 });

    const blocked = await request(app)
      .patch(`/api/reservations/${created.body.reservation.id}/cancel`)
      .set(authHeader(stranger));
    expect(blocked.status).toBe(403);

    const cancelled = await request(app)
      .patch(`/api/reservations/${created.body.reservation.id}/cancel`)
      .set(authHeader(owner));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.reservation.status).toBe('CANCELLED');
  });

  it('lets Staff cancel any reservation, freeing the dates for a new booking', async () => {
    const room = await createRoom({ capacity: 2 });
    const { token: guest } = await createUserAndLogin(app, 'GUEST');
    const { token: staff } = await createUserAndLogin(app, 'STAFF');

    const checkIn = daysFromNow(80).toISOString();
    const checkOut = daysFromNow(82).toISOString();

    const created = await request(app)
      .post('/api/reservations')
      .set(authHeader(guest))
      .send({ roomId: room.id, checkIn, checkOut, guests: 1 });

    await request(app).patch(`/api/reservations/${created.body.reservation.id}/cancel`).set(authHeader(staff));

    const rebooked = await request(app)
      .post('/api/reservations')
      .set(authHeader(guest))
      .send({ roomId: room.id, checkIn, checkOut, guests: 1 });
    expect(rebooked.status).toBe(201);
  });
});
