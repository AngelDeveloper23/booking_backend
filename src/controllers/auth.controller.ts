import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signAuthToken } from '../utils/jwt';
import { HttpError } from '../middleware/errorHandler';
import { Role } from '../types/domain';
import { env } from '../config/env';
import { generateResetToken, hashResetToken } from '../utils/passwordReset';

const SALT_ROUNDS = 10;

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function toPublicUser(user: { id: string; email: string; name: string; role: string; createdAt: Date }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt };
}

// Public self-registration always creates a GUEST account. Staff/Admin
// accounts are provisioned via seed data or by an existing Admin (Milestone 2/4 scope).
export async function register(req: Request, res: Response) {
  const { email, password, name } = req.body as z.infer<typeof registerSchema>;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: 'GUEST' },
  });

  const token = signAuthToken({ sub: user.id, role: user.role as Role, email: user.email });
  res.status(201).json({ token, user: toPublicUser(user) });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const token = signAuthToken({ sub: user.id, role: user.role as Role, email: user.email });
  res.json({ token, user: toPublicUser(user) });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  res.json({ user: toPublicUser(user) });
}

// Always responds with the same generic message whether or not the email
// exists, so this endpoint can't be used to enumerate registered accounts.
//
// There is no email service configured for this MVP (see README/ARCHITECTURE
// — payment gateways and hosting are explicitly out of scope, and adding SMTP
// for one flow isn't worth the setup cost). Instead the reset link is logged
// to the backend console, which is sufficient for local development/demo use
// and keeps the door open to swap in a real mailer later without touching
// this endpoint's contract.
export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body as z.infer<typeof forgotPasswordSchema>;

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const { rawToken, tokenHash, expiresAt } = generateResetToken();
    await prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt },
    });

    const resetLink = `${env.corsOrigin}/reset-password?token=${rawToken}`;
    console.log(`[password reset] ${email} -> ${resetLink} (expires ${expiresAt.toISOString()})`);
  }

  res.json({ message: 'If an account exists for that email, a password reset link has been sent.' });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body as z.infer<typeof resetPasswordSchema>;
  const tokenHash = hashResetToken(token);

  const user = await prisma.user.findFirst({ where: { resetTokenHash: tokenHash } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    throw new HttpError(400, 'This reset link is invalid or has expired');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    // Clearing the token makes it single-use.
    data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });

  res.json({ message: 'Password updated. You can now log in with your new password.' });
}
