import { NextFunction, Request, Response } from 'express';
import { Role } from '../types/domain';

// Must run after requireAuth. Enforces role-based access control (RBAC):
// each route declares which roles may call it.
export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}
