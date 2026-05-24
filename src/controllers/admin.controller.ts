import type { Request, Response } from 'express';

import { env } from '../config/env';
import type { AdminRequest } from '../middlewares/admin-auth.middleware';
import type { AppServices } from '../types/domain';
import { ok } from '../utils/api-response';
import { buildTicketQrUrl, extractTicketCode } from '../utils/ticket-code';
import type { Ticket } from '../types/domain';

const isTicket = (ticket: Ticket | null): ticket is Ticket => ticket !== null;

const requestIp = (req: Request): string =>
  String(req.headers['x-forwarded-for'] ?? req.ip ?? '').split(',')[0].trim();

const requestActor = (req: Request): { actorId: string | null; actorLabel: string | null } => {
  const admin = (req as AdminRequest).adminUser;
  return {
    actorId: admin?.id ?? null,
    actorLabel: admin?.label ?? null
  };
};

const track = async (
  services: AppServices,
  req: Request,
  input: { action: string; year?: string; targetType?: string | null; targetId?: string | null; status?: string; message?: string | null; metadata?: unknown }
): Promise<void> => {
  const actor = requestActor(req);
  await services.trackingRepository.create({
    year: input.year,
    action: input.action,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    ip: requestIp(req),
    method: req.method,
    path: req.originalUrl,
    targetType: input.targetType,
    targetId: input.targetId,
    status: input.status,
    message: input.message,
    metadata: input.metadata
  });
};

export const createAdminController = (services: AppServices) => ({
  me: async (req: Request, res: Response) => {
    const admin = (req as AdminRequest).adminUser;
    res.json(ok({ id: admin?.id ?? 'admin', label: admin?.label ?? 'Admin', year: env.CAMPAIGN_YEAR }));
  },

  stats: async (req: Request, res: Response) => {
    const { year, eventId } = req.query as { year?: string; eventId?: string };
    res.json(ok(await services.ticketRepository.stats(year, eventId)));
  },

  listEvents: async (req: Request, res: Response) => {
    const { year } = req.query as { year?: string };
    await services.eventRepository.ensureDefault(year);
    res.json(ok(await services.eventRepository.list(year)));
  },

  getEvent: async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { year } = req.query as { year?: string };
    res.json(ok(await services.eventRepository.findById(id, year)));
  },

  createEvent: async (req: Request, res: Response) => {
    const { year } = req.query as { year?: string };
    const data = await services.eventRepository.create(req.body as { nombre: string; descripcion?: string | null; fechaEvento?: string | null; estado?: 'activo' | 'finalizado' }, year);
    await track(services, req, { action: 'event.create', year, targetType: 'event', targetId: data.id, message: 'Evento creado', metadata: data });
    res.status(201).json(ok(data));
  },

  updateEvent: async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { year } = req.query as { year?: string };
    const data = await services.eventRepository.update(id, req.body as { nombre?: string; descripcion?: string | null; fechaEvento?: string | null; estado?: 'activo' | 'finalizado' }, year);
    await track(services, req, { action: 'event.update', year, targetType: 'event', targetId: data.id, message: 'Evento actualizado', metadata: data });
    res.json(ok(data));
  },

  listTrackingLogs: async (req: Request, res: Response) => {
    res.json(ok(await services.trackingRepository.list(req.query as unknown as {
      year?: string;
      limit: number;
      cursor?: string;
      search?: string;
      action?: string;
      actor?: string;
      ip?: string;
      dateFrom?: string;
      dateTo?: string;
    })));
  },

  getTrackingLog: async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { year } = req.query as { year?: string };
    res.json(ok(await services.trackingRepository.findById(Number(id), year)));
  },

  listTrackingActions: async (req: Request, res: Response) => {
    const { year } = req.query as { year?: string };
    res.json(ok(await services.trackingRepository.actions(year)));
  },

  listTickets: async (req: Request, res: Response) => {
    const { year, ...params } = req.query as unknown as {
      year?: string;
      eventId?: string;
      limit: number;
      cursor?: string;
      status?: string;
      search?: string;
      mode?: 'single' | 'batch';
    };
    res.json(ok(await services.ticketRepository.list(params, year)));
  },

  getTicket: async (req: Request, res: Response) => {
    const { codigo } = req.params as { codigo: string };
    const { year, eventId } = req.query as { year?: string; eventId?: string };
    res.json(ok(await services.ticketRepository.findByCode(codigo, year, eventId)));
  },

  createTicket: async (req: Request, res: Response) => {
    const { year, eventId } = req.query as { year?: string; eventId?: string };
    const { codigo, activada, bloqueada } = req.body as { codigo: string; activada?: boolean; bloqueada?: boolean };
    const safeEventId = await services.eventRepository.resolveEventId(eventId, year);
    const data = await services.ticketRepository.create({
      codigo: codigo.trim().toUpperCase(),
      activada,
      bloqueada,
      eventId: safeEventId,
      qrUrl: buildTicketQrUrl(env.PUBLIC_TICKET_BASE_URL, codigo)
    }, year);
    await track(services, req, { action: 'ticket.create', year, targetType: 'ticket', targetId: data.codigo, message: 'Entrada creada', metadata: data });
    res.status(201).json(ok(data));
  },

  updateTicket: async (req: Request, res: Response) => {
    const { codigo } = req.params as { codigo: string };
    const { year, eventId } = req.query as { year?: string; eventId?: string };
    const data = await services.ticketRepository.update(codigo, req.body as { activada?: boolean; bloqueada?: boolean }, year, eventId);
    await track(services, req, { action: 'ticket.update', year, targetType: 'ticket', targetId: data.codigo, message: 'Entrada actualizada', metadata: data });
    res.json(ok(data));
  },

  deleteTicket: async (req: Request, res: Response) => {
    const { codigo } = req.params as { codigo: string };
    const { year, eventId } = req.query as { year?: string; eventId?: string };
    await services.ticketRepository.delete(codigo, year, eventId);
    await track(services, req, { action: 'ticket.delete', year, targetType: 'ticket', targetId: codigo, message: 'Entrada eliminada' });
    res.status(204).send();
  },

  generateTickets: async (req: Request, res: Response) => {
    const { year, eventId } = req.query as { year?: string; eventId?: string };
    const safeEventId = await services.eventRepository.resolveEventId(eventId, year);
    const data = await services.ticketService.generateBatch({ ...(req.body as { quantity: number; prefix?: string; fisica?: boolean }), year, eventId: safeEventId });
    await track(services, req, { action: 'batch.generate', year, targetType: 'batch', targetId: data.batchId, message: `Lote generado con ${data.totalGenerated} entradas`, metadata: data });
    res.status(201).json(ok(data));
  },

  activateTicketBatch: async (req: Request, res: Response) => {
    const { batchId } = req.params as { batchId: string };
    const { year, eventId } = req.query as { year?: string; eventId?: string };
    const data = await services.ticketRepository.activateBatch(batchId, year, eventId);
    await track(services, req, { action: 'batch.activate', year, targetType: 'batch', targetId: batchId, message: 'Lote activado', metadata: data });
    res.json(ok(data));
  },

  deleteTicketBatch: async (req: Request, res: Response) => {
    const { batchId } = req.params as { batchId: string };
    const { year, eventId } = req.query as { year?: string; eventId?: string };
    const data = await services.ticketRepository.deleteBatch(batchId, year, eventId);
    await track(services, req, { action: 'batch.delete', year, targetType: 'batch', targetId: batchId, message: 'Lote eliminado', metadata: data });
    res.json(ok(data));
  },

  validateTicket: async (req: Request, res: Response) => {
    const { year, eventId } = req.query as { year?: string; eventId?: string };
    const code = extractTicketCode((req.body as { code: string }).code);
    const data = await services.ticketService.validate(code, year, eventId);
    await track(services, req, {
      action: data.summary?.type === 'batch' ? 'batch.validate' : 'ticket.validate',
      year,
      targetType: data.summary?.type ?? 'ticket',
      targetId: code,
      status: data.status,
      message: data.message,
      metadata: data
    });
    res.json(ok(data));
  },

  sendTicketsByEmail: async (req: Request, res: Response) => {
    const { year, eventId } = req.query as { year?: string; eventId?: string };
    const data = await services.ticketEmailService.sendTickets({ ...(req.body as { email: string; code?: string; batchId?: string }), eventId }, year);
    await track(services, req, { action: 'ticket.email', year, targetType: data.batchId ? 'batch' : 'ticket', targetId: data.batchId ?? null, message: `Email enviado a ${data.email}`, metadata: data });
    res.json(ok(data));
  },

  exportTickets: async (req: Request, res: Response) => {
    const { year, eventId } = req.query as { year?: string; eventId?: string };
    const tickets = await services.ticketRepository.exportAll(year, eventId);
    await track(services, req, { action: 'ticket.export_csv', year, targetType: 'export', targetId: year ?? env.CAMPAIGN_YEAR, message: 'Exportacion CSV', metadata: { total: tickets.length } });
    const header = 'eventId;codigo;activada;usada;bloqueada;fisica;lote;creado;activado;validado;qrUrl';
    const rows = tickets.map((ticket) => [
      ticket.eventId ?? '',
      ticket.codigo,
      ticket.activada ? '1' : '0',
      ticket.usada ? '1' : '0',
      ticket.bloqueada ? '1' : '0',
      ticket.fisica ? '1' : '0',
      ticket.batchId ?? '',
      ticket.createdAt,
      ticket.activadaAt ?? '',
      ticket.validatedAt ?? '',
      ticket.qrUrl ?? ''
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tickets-${year ?? env.CAMPAIGN_YEAR}.csv"`);
    res.send([header, ...rows].join('\n'));
  },

  downloadTicketsPdf: async (req: Request, res: Response) => {
    const { year, eventId, code, batchId } = req.query as { year?: string; eventId?: string; code?: string; batchId?: string };
    const tickets = code ? [await services.ticketRepository.findByCode(code, year, eventId)].filter(isTicket) : batchId ? await services.ticketRepository.findByBatch(batchId, year, eventId) : await services.ticketRepository.exportAll(year, eventId);
    const pdf = await services.ticketPdfService.createTicketsPdf(tickets);
    await track(services, req, { action: 'ticket.download_pdf', year, targetType: batchId ? 'batch' : code ? 'ticket' : 'export', targetId: batchId ?? code ?? year ?? env.CAMPAIGN_YEAR, message: 'Descarga PDF', metadata: { total: tickets.length } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="entradas-ffsj.pdf"');
    res.send(pdf);
  }
});
