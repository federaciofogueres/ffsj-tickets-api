import { z } from 'zod';

export const yearQuerySchema = z.object({
  year: z.string().trim().regex(/^\d{4}$/).optional()
});

export const listTicketsQuerySchema = yearQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  status: z.enum(['all', 'inactive', 'activated', 'validated', 'blocked']).optional(),
  search: z.string().optional(),
  mode: z.enum(['single', 'batch']).optional()
});

export const trackingListQuerySchema = yearQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  action: z.string().trim().max(80).optional(),
  actor: z.string().trim().max(120).optional(),
  ip: z.string().trim().max(80).optional(),
  dateFrom: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export const trackingIdSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const ticketCodeSchema = z.object({
  codigo: z.string().trim().min(4).max(80).regex(/^[a-zA-Z0-9-]+$/)
});

export const batchIdSchema = z.object({
  batchId: z.string().trim().min(4).max(120)
});

export const createTicketSchema = ticketCodeSchema.extend({
  activada: z.coerce.boolean().optional().default(false),
  bloqueada: z.coerce.boolean().optional().default(false)
});

export const updateTicketSchema = z.object({
  activada: z.coerce.boolean().optional(),
  bloqueada: z.coerce.boolean().optional()
});

export const generateTicketsSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(5000),
  prefix: z.string().trim().max(10).regex(/^[a-zA-Z0-9-]*$/).optional(),
  fisica: z.coerce.boolean().optional().default(false)
});

export const ticketEmailSchema = z.object({
  email: z.string().email(),
  code: ticketCodeSchema.shape.codigo.optional(),
  batchId: batchIdSchema.shape.batchId.optional()
}).refine((value) => Boolean(value.code) !== Boolean(value.batchId), {
  path: ['code'],
  message: 'Indica un ticket o un lote, no ambos'
});

export const validateTicketSchema = z.object({
  code: z.string().trim().min(1)
});
