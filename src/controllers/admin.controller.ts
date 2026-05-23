import type { Request, Response } from 'express';

import { env } from '../config/env';
import type { AdminRequest } from '../middlewares/admin-auth.middleware';
import type { AppServices } from '../types/domain';
import { ok } from '../utils/api-response';
import { buildTicketQrUrl, extractTicketCode } from '../utils/ticket-code';
import type { Ticket } from '../types/domain';

const isTicket = (ticket: Ticket | null): ticket is Ticket => ticket !== null;

export const createAdminController = (services: AppServices) => ({
  me: async (req: Request, res: Response) => {
    const admin = (req as AdminRequest).adminUser;
    res.json(ok({ id: admin?.id ?? 'admin', label: admin?.label ?? 'Admin', year: env.CAMPAIGN_YEAR }));
  },

  stats: async (req: Request, res: Response) => {
    const { year } = req.query as { year?: string };
    res.json(ok(await services.ticketRepository.stats(year)));
  },

  listTickets: async (req: Request, res: Response) => {
    const { year, ...params } = req.query as unknown as {
      year?: string;
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
    const { year } = req.query as { year?: string };
    res.json(ok(await services.ticketRepository.findByCode(codigo, year)));
  },

  createTicket: async (req: Request, res: Response) => {
    const { year } = req.query as { year?: string };
    const { codigo, activada, bloqueada } = req.body as { codigo: string; activada?: boolean; bloqueada?: boolean };
    const data = await services.ticketRepository.create({
      codigo: codigo.trim().toUpperCase(),
      activada,
      bloqueada,
      qrUrl: buildTicketQrUrl(env.PUBLIC_TICKET_BASE_URL, codigo)
    }, year);
    res.status(201).json(ok(data));
  },

  updateTicket: async (req: Request, res: Response) => {
    const { codigo } = req.params as { codigo: string };
    const { year } = req.query as { year?: string };
    res.json(ok(await services.ticketRepository.update(codigo, req.body as { activada?: boolean; bloqueada?: boolean }, year)));
  },

  deleteTicket: async (req: Request, res: Response) => {
    const { codigo } = req.params as { codigo: string };
    const { year } = req.query as { year?: string };
    await services.ticketRepository.delete(codigo, year);
    res.status(204).send();
  },

  generateTickets: async (req: Request, res: Response) => {
    const { year } = req.query as { year?: string };
    res.status(201).json(ok(await services.ticketService.generateBatch({ ...(req.body as { quantity: number; prefix?: string; fisica?: boolean }), year })));
  },

  activateTicketBatch: async (req: Request, res: Response) => {
    const { batchId } = req.params as { batchId: string };
    const { year } = req.query as { year?: string };
    res.json(ok(await services.ticketRepository.activateBatch(batchId, year)));
  },

  deleteTicketBatch: async (req: Request, res: Response) => {
    const { batchId } = req.params as { batchId: string };
    const { year } = req.query as { year?: string };
    res.json(ok(await services.ticketRepository.deleteBatch(batchId, year)));
  },

  validateTicket: async (req: Request, res: Response) => {
    const { year } = req.query as { year?: string };
    const code = extractTicketCode((req.body as { code: string }).code);
    res.json(ok(await services.ticketService.validate(code, year)));
  },

  sendTicketsByEmail: async (req: Request, res: Response) => {
    const { year } = req.query as { year?: string };
    res.json(ok(await services.ticketEmailService.sendTickets(req.body as { email: string; code?: string; batchId?: string }, year)));
  },

  exportTickets: async (req: Request, res: Response) => {
    const { year } = req.query as { year?: string };
    const tickets = await services.ticketRepository.exportAll(year);
    const header = 'codigo;activada;usada;bloqueada;fisica;lote;creado;activado;validado;qrUrl';
    const rows = tickets.map((ticket) => [
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
    const { year, code, batchId } = req.query as { year?: string; code?: string; batchId?: string };
    const tickets = code ? [await services.ticketRepository.findByCode(code, year)].filter(isTicket) : batchId ? await services.ticketRepository.findByBatch(batchId, year) : await services.ticketRepository.exportAll(year);
    const pdf = await services.ticketPdfService.createTicketsPdf(tickets);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="entradas-ffsj.pdf"');
    res.send(pdf);
  }
});
