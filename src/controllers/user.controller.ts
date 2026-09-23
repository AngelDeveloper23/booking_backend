import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';
import { ROLES } from '../types/domain';

export const updateRoleSchema = z.object({
  role: z.enum(ROLES as [string, ...string[]]),
});

const userListSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} as const;

export async function listUsers(_req: Request, res: Response) {
  const users = await prisma.user.findMany({ select: userListSelect, orderBy: { createdAt: 'asc' } });
  res.json({ users });
}

export async function updateUserRole(req: Request, res: Response) {
  const { role } = req.body as z.infer<typeof updateRoleSchema>;

  if (req.params.id === req.user!.sub) {
    throw new HttpError(400, 'You cannot change your own role');
  }

  const user = await prisma.user
    .update({ where: { id: req.params.id }, data: { role }, select: userListSelect })
    .catch(() => null);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  res.json({ user });
}
