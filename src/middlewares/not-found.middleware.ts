import type { Request, Response } from 'express';

import { fail } from '../utils/api-response';

export const notFoundMiddleware = (req: Request, res: Response): void => {
  res.status(404).json(fail('NOT_FOUND', `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
};
