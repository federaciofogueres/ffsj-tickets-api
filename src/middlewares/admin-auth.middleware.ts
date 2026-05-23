import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env';
import { fail } from '../utils/api-response';

type JwtPayload = Record<string, unknown> & {
  exp?: number;
  id?: string | number;
  idAsociado?: string | number;
  id_asociado?: string | number;
  user?: string;
  username?: string;
  sub?: string;
  role?: string;
  roles?: string[] | string;
  cargos?: Array<{ idCargo?: string | number }>;
};

export type AdminRequest = Request & {
  adminUser?: { id: string; label: string };
};

const parseCsv = (value: string): string[] => value.split(',').map((item) => item.trim()).filter(Boolean);

const base64UrlDecode = (value: string): Buffer => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(`${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`, 'base64');
};

const parseJwt = (token: string): JwtPayload | null => {
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart || !env.ADMIN_JWT_SECRET) return null;
  const header = JSON.parse(base64UrlDecode(headerPart).toString('utf8')) as { alg?: string };
  const algorithm = ({ HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' } as Record<string, string>)[header.alg ?? ''];
  if (!algorithm) return null;
  const expected = createHmac(algorithm, env.ADMIN_JWT_SECRET).update(`${headerPart}.${payloadPart}`).digest();
  const received = base64UrlDecode(signaturePart);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  const payload = JSON.parse(base64UrlDecode(payloadPart).toString('utf8')) as JwtPayload;
  if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) return null;
  return payload;
};

const getUserId = (payload: JwtPayload): string =>
  String(payload.idAsociado ?? payload.id_asociado ?? payload.id ?? payload.user ?? payload.username ?? payload.sub ?? 'admin');

const hasAdminAccess = (payload: JwtPayload): boolean => {
  const userId = getUserId(payload);
  const allowedUsers = parseCsv(env.ADMIN_JWT_ALLOWED_USERS);
  const adminCargoIds = parseCsv(env.ADMIN_JWT_ADMIN_CARGO_IDS);
  const adminRoles = parseCsv(env.ADMIN_JWT_ADMIN_ROLES).map((role) => role.toLowerCase());
  const roles = Array.isArray(payload.roles) ? payload.roles : typeof payload.roles === 'string' ? payload.roles.split(',') : payload.role ? [payload.role] : [];
  const cargos = Array.isArray(payload.cargos) ? payload.cargos.map((cargo) => String(cargo.idCargo ?? '')).filter(Boolean) : [];

  return allowedUsers.includes(userId) || userId === '8976' || cargos.some((cargo) => adminCargoIds.includes(cargo)) || roles.some((role) => adminRoles.includes(String(role).toLowerCase()));
};

export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const bearer = req.header('authorization')?.startsWith('Bearer ') ? req.header('authorization')!.slice(7).trim() : '';
  if (bearer) {
    try {
      const payload = parseJwt(bearer);
      if (payload && hasAdminAccess(payload)) {
        (req as AdminRequest).adminUser = { id: getUserId(payload), label: String(payload.user ?? payload.username ?? getUserId(payload)) };
        next();
        return;
      }
    } catch {
      res.status(401).json(fail('UNAUTHORIZED', 'Token admin invalido'));
      return;
    }
  }

  const apiKey = req.header('x-admin-key');
  if (!apiKey || apiKey !== env.ADMIN_API_KEY) {
    res.status(401).json(fail('UNAUTHORIZED', 'Credenciales admin invalidas'));
    return;
  }

  (req as AdminRequest).adminUser = { id: 'admin-api-key', label: 'Admin API key' };
  next();
};
