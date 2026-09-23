import { Router } from 'express';
import {
  availabilityQuerySchema,
  createRoom,
  deleteRoom,
  getRoom,
  getRoomAvailability,
  listAllRoomsForAdmin,
  listRooms,
  roomInputSchema,
  searchQuerySchema,
  searchRooms,
  updateRoom,
} from '../controllers/room.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';

const router = Router();
const idParamSchema = z.object({ id: z.string().min(1) });

// Public endpoints - guests can browse without an account.
router.get('/', asyncHandler(listRooms));
router.get('/search', validate({ query: searchQuerySchema }), asyncHandler(searchRooms));
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(getRoom));
router.get(
  '/:id/availability',
  validate({ params: idParamSchema, query: availabilityQuerySchema }),
  asyncHandler(getRoomAvailability)
);

// Staff/Admin: full room list including inactive rooms.
router.get('/admin/all', requireAuth, requireRole('ADMIN', 'STAFF'), asyncHandler(listAllRoomsForAdmin));

// Admin-only: room management.
router.post('/', requireAuth, requireRole('ADMIN'), validate({ body: roomInputSchema }), asyncHandler(createRoom));
router.put(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  validate({ params: idParamSchema, body: roomInputSchema.partial() }),
  asyncHandler(updateRoom)
);
router.delete(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(deleteRoom)
);

export default router;
