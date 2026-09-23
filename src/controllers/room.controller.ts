import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';
import { findAvailableRoomIds, getUnavailableDatesInRange } from '../services/availability.service';

export const roomInputSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  capacity: z.coerce.number().int().positive(),
  pricePerNight: z.coerce.number().positive(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  isActive: z.coerce.boolean().optional(),
});

export const searchQuerySchema = z
  .object({
    checkIn: z.string().datetime().optional(),
    checkOut: z.string().datetime().optional(),
    guests: z.coerce.number().int().positive().optional(),
  })
  .refine((v) => (v.checkIn && v.checkOut ? new Date(v.checkIn) < new Date(v.checkOut) : true), {
    message: 'checkIn must be before checkOut',
  });

export const availabilityQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function listRooms(req: Request, res: Response) {
  const rooms = await prisma.room.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  res.json({ rooms });
}

// Admin view includes inactive rooms so they can be re-activated/edited.
export async function listAllRoomsForAdmin(_req: Request, res: Response) {
  const rooms = await prisma.room.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ rooms });
}

export async function searchRooms(req: Request, res: Response) {
  const { checkIn, checkOut, guests } = req.query as unknown as z.infer<typeof searchQuerySchema>;

  const where: Record<string, unknown> = { isActive: true };
  if (guests) {
    where.capacity = { gte: guests };
  }

  const rooms = await prisma.room.findMany({ where, orderBy: { pricePerNight: 'asc' } });

  if (!checkIn || !checkOut) {
    res.json({ rooms, filtered: false });
    return;
  }

  const unavailableRoomIds = await findAvailableRoomIds(prisma, new Date(checkIn), new Date(checkOut));
  const available = rooms.filter((room) => !unavailableRoomIds.has(room.id));
  res.json({ rooms: available, filtered: true });
}

export async function getRoom(req: Request, res: Response) {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room) {
    throw new HttpError(404, 'Room not found');
  }
  res.json({ room });
}

export async function getRoomAvailability(req: Request, res: Response) {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room) {
    throw new HttpError(404, 'Room not found');
  }

  const { year, month } = req.query as unknown as z.infer<typeof availabilityQuerySchema>;
  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  const rangeEnd = new Date(Date.UTC(year, month, 1));

  const unavailableDates = await getUnavailableDatesInRange(prisma, room.id, rangeStart, rangeEnd);
  res.json({ roomId: room.id, year, month, unavailableDates });
}

export async function createRoom(req: Request, res: Response) {
  const data = req.body as z.infer<typeof roomInputSchema>;
  const room = await prisma.room.create({ data: { ...data, imageUrl: data.imageUrl || null } });
  res.status(201).json({ room });
}

export async function updateRoom(req: Request, res: Response) {
  const data = req.body as Partial<z.infer<typeof roomInputSchema>>;
  const room = await prisma.room
    .update({ where: { id: req.params.id }, data: { ...data, imageUrl: data.imageUrl || undefined } })
    .catch(() => null);
  if (!room) {
    throw new HttpError(404, 'Room not found');
  }
  res.json({ room });
}

// Soft delete: keeps historical reservations intact while removing the room
// from guest-facing search and listings.
export async function deleteRoom(req: Request, res: Response) {
  const room = await prisma.room
    .update({ where: { id: req.params.id }, data: { isActive: false } })
    .catch(() => null);
  if (!room) {
    throw new HttpError(404, 'Room not found');
  }
  res.json({ room });
}
