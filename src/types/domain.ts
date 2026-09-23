// SQLite has no native enum support, so Prisma models store these as plain
// strings. These types/lists are the single source of truth for valid values.

export type Role = 'GUEST' | 'STAFF' | 'ADMIN';
export const ROLES: Role[] = ['GUEST', 'STAFF', 'ADMIN'];

export type ReservationStatus = 'CONFIRMED' | 'CANCELLED';
