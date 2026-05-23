import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

import { fail } from '../utils/api-response';

const validate = (source: 'body' | 'params' | 'query', schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction): void => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) {
    res.status(400).json(fail('VALIDATION_ERROR', 'Datos de entrada invalidos', parsed.error.flatten()));
    return;
  }
  req[source] = parsed.data;
  next();
};

export const validateBody = (schema: z.ZodTypeAny) => validate('body', schema);
export const validateParams = (schema: z.ZodTypeAny) => validate('params', schema);
export const validateQuery = (schema: z.ZodTypeAny) => validate('query', schema);
