import { Router } from 'express';
import authRoutes from './auth.routes';
import roomRoutes from './room.routes';
import reservationRoutes from './reservation.routes';
import userRoutes from './user.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/rooms', roomRoutes);
router.use('/reservations', reservationRoutes);
router.use('/users', userRoutes);

export default router;
