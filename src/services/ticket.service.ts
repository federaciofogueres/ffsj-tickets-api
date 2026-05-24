import { randomUUID } from 'node:crypto';

import { env } from '../config/env';
import type { Ticket, TicketBatchResult, TicketValidationResult } from '../types/domain';
import { buildTicketQrUrl, createTicketCode } from '../utils/ticket-code';
import type { TicketRepository } from '../repositories/ticket.repository';
import { AppError } from '../utils/app-error';

export class TicketService {
  constructor(private readonly ticketRepository: TicketRepository) {}

  async generateBatch(input: { quantity: number; prefix?: string; fisica?: boolean; year?: string; eventId?: string | null }): Promise<TicketBatchResult> {
    const batchId = randomUUID();
    const now = new Date().toISOString();
    const fisica = Boolean(input.fisica);
    const tickets: Ticket[] = [];
    const uniqueCodes = new Set<string>();

    while (tickets.length < input.quantity) {
      const codigo = createTicketCode(input.prefix);
      if (uniqueCodes.has(codigo) || await this.ticketRepository.exists(codigo, input.year, input.eventId)) {
        continue;
      }
      uniqueCodes.add(codigo);
      tickets.push({
        eventId: input.eventId ?? null,
        codigo,
        activada: false,
        activadaAt: null,
        usada: false,
        usadaAt: null,
        bloqueada: false,
        fisica,
        validatedAt: null,
        createdAt: now,
        batchId,
        qrUrl: buildTicketQrUrl(env.PUBLIC_TICKET_BASE_URL, codigo)
      });
    }

    await this.ticketRepository.createMany(tickets, input.year, input.eventId);
    return {
      batchId,
      totalGenerated: tickets.length,
      fisica,
      tickets: tickets.map((ticket) => ({ codigo: ticket.codigo, qrUrl: ticket.qrUrl ?? '', fisica }))
    };
  }

  async validate(code: string, year?: string, eventId?: string | null): Promise<TicketValidationResult> {
    const ticket = await this.ticketRepository.findByCode(code, year, eventId);
    if (!ticket) {
      const batchTickets = await this.ticketRepository.findByBatch(code, year, eventId);
      if (batchTickets.length) {
        return this.validateBatch(code, batchTickets, year, eventId);
      }
      return { status: 'invalid', codigo: code, ticket: null, message: 'Entrada no encontrada.' };
    }
    if (ticket.bloqueada) {
      return { status: 'blocked', codigo: code, ticket, message: 'Entrada bloqueada.', summary: this.ticketSummary(ticket, 0) };
    }
    if (!ticket.activada) {
      return { status: 'inactive', codigo: code, ticket, message: 'Entrada pendiente de activar.', summary: this.ticketSummary(ticket, 0) };
    }
    if (ticket.usada) {
      const validatedAt = ticket.validatedAt ?? ticket.usadaAt;
      return {
        status: 'used',
        codigo: code,
        ticket,
        message: validatedAt ? `Entrada ya validada. Validada el ${validatedAt}.` : 'Entrada ya validada.',
        summary: this.ticketSummary(ticket, 0)
      };
    }

    let validated: Ticket;
    try {
      validated = await this.ticketRepository.markValidated(code, year, eventId);
    } catch (error) {
      if (error instanceof AppError && error.code === 'TICKET_USED') {
        const usedTicket = await this.ticketRepository.findByCode(code, year, eventId);
        const validatedAt = usedTicket?.validatedAt ?? usedTicket?.usadaAt;
        return {
          status: 'used',
          codigo: code,
          ticket: usedTicket,
          message: validatedAt ? `Entrada ya validada. Validada el ${validatedAt}.` : 'Entrada ya validada.',
          summary: usedTicket ? this.ticketSummary(usedTicket, 0) : undefined
        };
      }
      throw error;
    }
    return { status: 'valid', codigo: code, ticket: validated, message: 'Entrada valida.', summary: this.ticketSummary(validated, 1) };
  }

  private async validateBatch(code: string, tickets: Ticket[], year?: string, eventId?: string | null): Promise<TicketValidationResult> {
    const blocked = tickets.filter((ticket) => ticket.bloqueada).length;
    const inactive = tickets.filter((ticket) => !ticket.activada).length;
    const alreadyValidated = tickets.filter((ticket) => ticket.usada).length;

    if (blocked || inactive) {
      return {
        status: 'invalid',
        codigo: code,
        ticket: null,
        message: `Lote no validable. ${inactive} entradas pendientes de activar y ${blocked} bloqueadas.`,
        summary: this.batchSummary(tickets, 0)
      };
    }

    const { validatedNow, tickets: updatedTickets } = await this.ticketRepository.markBatchValidated(code, year, eventId);
    const summary = this.batchSummary(updatedTickets, validatedNow)!;
    if (validatedNow === 0 && alreadyValidated > 0) {
      return {
        status: 'used',
        codigo: code,
        ticket: null,
        message: summary.validatedAt ? `Lote ya validado. Validado el ${summary.validatedAt}.` : 'Lote ya validado.',
        summary
      };
    }

    if (alreadyValidated > 0) {
      return {
        status: 'used',
        codigo: code,
        ticket: null,
        message: `Lote validado parcialmente. ${alreadyValidated} entradas ya estaban validadas.`,
        summary
      };
    }

    return {
      status: 'valid',
      codigo: code,
      ticket: null,
      message: `Lote validado: ${validatedNow}/${tickets.length} entradas.`,
      summary
    };
  }

  private ticketSummary(ticket: Ticket, validatedNow: number): TicketValidationResult['summary'] {
    return {
      type: 'ticket',
      total: 1,
      validatedNow,
      alreadyValidated: ticket.usada && validatedNow === 0 ? 1 : 0,
      inactive: ticket.activada ? 0 : 1,
      blocked: ticket.bloqueada ? 1 : 0,
      validatedAt: ticket.validatedAt ?? ticket.usadaAt
    };
  }

  private batchSummary(tickets: Ticket[], validatedNow: number): TicketValidationResult['summary'] {
    const validatedTickets = tickets.filter((ticket) => ticket.usada);
    return {
      type: 'batch',
      total: tickets.length,
      validatedNow,
      alreadyValidated: Math.max(0, validatedTickets.length - validatedNow),
      inactive: tickets.filter((ticket) => !ticket.activada).length,
      blocked: tickets.filter((ticket) => ticket.bloqueada).length,
      validatedAt: validatedTickets
        .map((ticket) => ticket.validatedAt ?? ticket.usadaAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null
    };
  }
}
