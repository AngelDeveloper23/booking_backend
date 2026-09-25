import { Router } from 'express';
import {
  forgotPassword,
  forgotPasswordSchema,
  login,
  loginSchema,
  me,
  register,
  registerSchema,
  resetPassword,
  resetPasswordSchema,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/register', validate({ body: registerSchema }), asyncHandler(register));
router.post('/login', validate({ body: loginSchema }), asyncHandler(login));
router.get('/me', requireAuth, asyncHandler(me));
router.post('/forgot-password', validate({ body: forgotPasswordSchema }), asyncHandler(forgotPassword));
router.post('/reset-password', validate({ body: resetPasswordSchema }), asyncHandler(resetPassword));

export default router;
