import { Router } from 'express';
import { login, loginSchema, me, register, registerSchema } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/register', validate({ body: registerSchema }), asyncHandler(register));
router.post('/login', validate({ body: loginSchema }), asyncHandler(login));
router.get('/me', requireAuth, asyncHandler(me));

export default router;
