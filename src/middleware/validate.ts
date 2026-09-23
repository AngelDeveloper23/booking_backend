import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

type Schemas = Partial<{ body: ZodTypeAny; query: ZodTypeAny; params: ZodTypeAny }>;

export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      next(err);
    }
  };
}
