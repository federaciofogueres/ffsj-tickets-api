import type { NextFunction, Request, Response } from 'express';

import { fail } from '../utils/api-response';
import { AppError } from '../utils/app-error';

const serializeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: string; errno?: number; sqlMessage?: string };
    return {
      name: error.name,
      message: error.message,
      code: withCode.code,
      errno: withCode.errno,
      sqlMessage: withCode.sqlMessage,
      stack: error.stack
    };
  }

  return { error };
};

export const errorMiddleware = (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      console.error('Handled server error', {
        method: req.method,
        path: req.originalUrl,
        code: error.code,
        statusCode: error.statusCode,
        message: error.message,
        details: error.details
      });
    }

    res.status(error.statusCode).json(fail(error.code, error.message, error.details));
    return;
  }

  const message = error instanceof Error ? error.message : 'Error interno';
  console.error('Unhandled server error', {
    method: req.method,
    path: req.originalUrl,
    ...serializeError(error)
  });

  res.status(500).json(fail('INTERNAL_ERROR', message));
};
