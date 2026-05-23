import { Router } from 'express';

import { pool } from '../config/mysql';
import { ok } from '../utils/api-response';

export const createHealthRouter = (): Router => {
  const router = Router();
  router.get('/health', (_req, res) => res.json(ok({ status: 'ok' })));
  router.get('/health/db', async (_req, res, next) => {
    try {
      await pool.query('SELECT 1');
      res.json(ok({ status: 'ok' }));
    } catch (error) {
      next(error);
    }
  });
  return router;
};
