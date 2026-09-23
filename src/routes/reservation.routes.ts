import { Router } from 'express';
import { z } from 'zod';
import {
  cancelReservation,
  createReservation,
  createReservationSchema,
  listAllReservations,
  listMyReservations,
} from '../controllers/reservation.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const idParamSchema = z.object({ id: z.string().min(1) });

router.use(requireAuth);

// Guests book for themselves; Staff/Admin manage on behalf of guests rather
// than booking their own stays through this endpoint.
router.post(
  '/',
  requireRole('GUEST'),
  validate({ body: createReservationSchema }),
  asyncHandler(createReservation)
);
router.get('/mine', requireRole('GUEST'), asyncHandler(listMyReservations));
router.get('/', requireRole('STAFF', 'ADMIN'), asyncHandler(listAllReservations));
router.patch('/:id/cancel', validate({ params: idParamSchema }), asyncHandler(cancelReservation));

export default router;
