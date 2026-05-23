import type { NextFunction, Request, Response } from 'express';

import { fail } from '../utils/api-response';
import { AppError } from '../utils/app-error';

export const errorMiddleware = (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json(fail(error.code, error.message, error.details));
    return;
  }

  const message = error instanceof Error ? error.message : 'Error interno';
  res.status(500).json(fail('INTERNAL_ERROR', message));
};
