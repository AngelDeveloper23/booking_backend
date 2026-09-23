import { Prisma, PrismaClient } from '@prisma/client';

// Accepts either the shared PrismaClient or a $transaction callback's client,
// so the exact same overlap query can run standalone (search/availability
// endpoints) or as part of an atomic check-and-insert (booking creation).
type Db = PrismaClient | Prisma.TransactionClient;

// Two date ranges [aStart, aEnd) and [bStart, bEnd) overlap iff
// aStart < bEnd AND aEnd > bStart. Checkout day itself is not counted as
// occupied, so a guest can check in the same day another guest checks out.
export async function hasOverlappingReservation(
  db: Db,
  roomId: string,
  checkIn: Date,
  checkOut: Date,
  excludeReservationId?: string
): Promise<boolean> {
  const conflict = await db.reservation.findFirst({
    where: {
      roomId,
      status: 'CONFIRMED',
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { id: true },
  });
  return conflict !== null;
}

export async function findAvailableRoomIds(db: Db, checkIn: Date, checkOut: Date): Promise<Set<string>> {
  const overlapping = await db.reservation.findMany({
    where: {
      status: 'CONFIRMED',
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { roomId: true },
  });
  return new Set(overlapping.map((r) => r.roomId));
}

// Returns every calendar day (as YYYY-MM-DD) that is occupied by a confirmed
// reservation for the room, clipped to [rangeStart, rangeEnd).
export async function getUnavailableDatesInRange(
  db: Db,
  roomId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<string[]> {
  const reservations = await db.reservation.findMany({
    where: {
      roomId,
      status: 'CONFIRMED',
      checkIn: { lt: rangeEnd },
      checkOut: { gt: rangeStart },
    },
    select: { checkIn: true, checkOut: true },
  });

  const unavailable = new Set<string>();
  for (const { checkIn, checkOut } of reservations) {
    const start = checkIn > rangeStart ? checkIn : rangeStart;
    const end = checkOut < rangeEnd ? checkOut : rangeEnd;
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    while (cursor < stop) {
      unavailable.add(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return Array.from(unavailable).sort();
}
