import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';
import { hasOverlappingReservation } from '../services/availability.service';

export const createReservationSchema = z
  .object({
    roomId: z.string().min(1),
    checkIn: z.string().datetime(),
    checkOut: z.string().datetime(),
    guests: z.coerce.number().int().positive(),
  })
  .refine((v) => new Date(v.checkIn) < new Date(v.checkOut), {
    message: 'checkIn must be before checkOut',
    path: ['checkOut'],
  });

const roomSummarySelect = {
  select: { id: true, name: true, type: true, imageUrl: true, pricePerNight: true },
} as const;

const userSummarySelect = {
  select: { id: true, name: true, email: true },
} as const;

// Creates a reservation with the double-booking check and the insert in a
// single Prisma transaction. On SQLite (a single-writer database) this
// serializes concurrent bookings for the same room: the second transaction's
// overlap check does not run until the first has committed, so it correctly
// sees the just-inserted row and is rejected instead of racing past it.
// See docs/ARCHITECTURE.md for the reasoning and how this generalizes to
// Postgres.
export async function createReservation(req: Request, res: Response) {
  const { roomId, checkIn, checkOut, guests } = req.body as z.infer<typeof createReservationSchema>;
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (checkInDate < today) {
    throw new HttpError(400, 'Check-in date cannot be in the past');
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || !room.isActive) {
    throw new HttpError(404, 'Room not found');
  }
  if (guests > room.capacity) {
    throw new HttpError(400, `This room sleeps up to ${room.capacity} guests`);
  }

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const conflict = await hasOverlappingReservation(tx, roomId, checkInDate, checkOutDate);
      if (conflict) {
        throw new HttpError(409, 'This room is no longer available for the selected dates');
      }
      return tx.reservation.create({
        data: { roomId, userId: req.user!.sub, checkIn: checkInDate, checkOut: checkOutDate, guests },
        include: { room: roomSummarySelect },
      });
    });
    res.status(201).json({ reservation });
  } catch (err) {
    // Defensive fallback: if two bookings for the same room land in the same
    // instant, SQLite's writer lock can surface as a raw "database is
    // locked" error from the losing transaction instead of our app-level
    // overlap check running at all. Either way, no double booking is ever
    // committed — this just gives the loser the same friendly 409 the
    // overlap check would have produced.
    if (err instanceof Error && /locked|busy/i.test(err.message)) {
      throw new HttpError(409, 'This room is no longer available for the selected dates');
    }
    throw err;
  }
}

export async function listMyReservations(req: Request, res: Response) {
  const reservations = await prisma.reservation.findMany({
    where: { userId: req.user!.sub },
    include: { room: roomSummarySelect },
    orderBy: { checkIn: 'desc' },
  });
  res.json({ reservations });
}

// Staff/Admin: every reservation across all guests, for the reservations
// dashboard.
export async function listAllReservations(_req: Request, res: Response) {
  const reservations = await prisma.reservation.findMany({
    include: { room: roomSummarySelect, user: userSummarySelect },
    orderBy: { checkIn: 'desc' },
  });
  res.json({ reservations });
}

// A guest may cancel only their own reservation; Staff/Admin may cancel any
// (the "limited booking-management actions" the brief grants Staff).
export async function cancelReservation(req: Request, res: Response) {
  const reservation = await prisma.reservation.findUnique({ where: { id: req.params.id } });
  if (!reservation) {
    throw new HttpError(404, 'Reservation not found');
  }

  const isOwner = reservation.userId === req.user!.sub;
  const isStaffOrAdmin = req.user!.role === 'STAFF' || req.user!.role === 'ADMIN';
  if (!isOwner && !isStaffOrAdmin) {
    throw new HttpError(403, 'You can only cancel your own reservations');
  }

  if (reservation.status === 'CANCELLED') {
    res.json({ reservation });
    return;
  }

  const updated = await prisma.reservation.update({
    where: { id: reservation.id },
    data: { status: 'CANCELLED' },
    include: { room: roomSummarySelect, user: userSummarySelect },
  });
  res.json({ reservation: updated });
}
