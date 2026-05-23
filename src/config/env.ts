import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  NODE_ENV: z.preprocess(
    (value) => value === 'prod' ? 'production' : value,
    z.enum(['development', 'test', 'production']).default('development')
  ),
  ADMIN_API_KEY: z.string().optional().default(''),
  ADMIN_JWT_SECRET: z.string().min(1).optional(),
  ADMIN_JWT_ALLOWED_USERS: z.string().optional().default(''),
  ADMIN_JWT_ADMIN_ROLES: z.string().optional().default('admin,administrator,Administrador'),
  ADMIN_JWT_ADMIN_CARGO_IDS: z.string().optional().default('16'),
  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string().optional().default(''),
  MYSQL_DATABASE: z.string().min(1),
  MYSQL_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
  CAMPAIGN_YEAR: z.string().min(4).default('2026'),
  PUBLIC_TICKET_BASE_URL: z.string().url().default('https://tickets.hogueras.es'),
  CORS_ALLOWED_ORIGINS: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().optional().default(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('')
});

const rawEnv = {
  ...process.env,
  PORT: process.env.PORT ?? process.env.WEBSITES_PORT ?? (process.env.NODE_ENV === 'production' ? '8080' : '4100')
};

const parsedEnv = envSchema.safeParse(rawEnv);

if (!parsedEnv.success) {
  console.error('Invalid environment configuration', parsedEnv.error.flatten().fieldErrors);
  throw parsedEnv.error;
}

export const env = parsedEnv.data;
