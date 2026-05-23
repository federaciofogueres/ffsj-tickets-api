import { Router } from 'express';

import { ok } from '../utils/api-response';

export const createHealthRouter = (): Router => {
  const router = Router();
  router.get('/health', (_req, res) => res.json(ok({ status: 'ok' })));
  return router;
};
