import express from 'express';

import { env } from './config/env';
import { errorMiddleware } from './middlewares/error.middleware';
import { notFoundMiddleware } from './middlewares/not-found.middleware';
import { createAdminRouter } from './routes/admin.routes';
import { createHealthRouter } from './routes/health.routes';
import type { AppServices } from './types/domain';

const allowedOrigins = (): Set<string> => new Set([
  'http://localhost:4200',
  'http://localhost:4201',
  'http://localhost:4300',
  'https://tickets.hogueras.es',
  ...env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
]);

export const createApp = (services: AppServices) => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    const origin = req.header('origin');
    const responseOrigin = env.NODE_ENV === 'development' ? origin || '*' : origin && allowedOrigins().has(origin) ? origin : 'https://tickets.hogueras.es';
    res.header('Access-Control-Allow-Origin', responseOrigin);
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createHealthRouter());
  app.use('/api/admin', createAdminRouter(services));
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
};
