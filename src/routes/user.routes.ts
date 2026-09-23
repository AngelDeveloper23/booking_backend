import { Router } from 'express';
import { z } from 'zod';
import { listUsers, updateRoleSchema, updateUserRole } from '../controllers/user.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const idParamSchema = z.object({ id: z.string().min(1) });

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', asyncHandler(listUsers));
router.patch('/:id/role', validate({ params: idParamSchema, body: updateRoleSchema }), asyncHandler(updateUserRole));

export default router;
