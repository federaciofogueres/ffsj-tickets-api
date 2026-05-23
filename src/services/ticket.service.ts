import { randomUUID } from 'node:crypto';

import { env } from '../config/env';
import type { Ticket, TicketBatchResult, TicketValidationResult } from '../types/domain';
import { buildTicketQrUrl, createTicketCode } from '../utils/ticket-code';
import type { TicketRepository } from '../repositories/ticket.repository';

export class TicketService {
  constructor(private readonly ticketRepository: TicketRepository) {}

  async generateBatch(input: { quantity: number; prefix?: string; fisica?: boolean; year?: string }): Promise<TicketBatchResult> {
    const batchId = randomUUID();
    const now = new Date().toISOString();
    const fisica = Boolean(input.fisica);
    const tickets: Ticket[] = [];
    const uniqueCodes = new Set<string>();

    while (tickets.length < input.quantity) {
      const codigo = createTicketCode(input.prefix);
      if (uniqueCodes.has(codigo) || await this.ticketRepository.exists(codigo, input.year)) {
        continue;
      }
      uniqueCodes.add(codigo);
      tickets.push({
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

    await this.ticketRepository.createMany(tickets, input.year);
    return {
      batchId,
      totalGenerated: tickets.length,
      fisica,
      tickets: tickets.map((ticket) => ({ codigo: ticket.codigo, qrUrl: ticket.qrUrl ?? '', fisica }))
    };
  }

  async validate(code: string, year?: string): Promise<TicketValidationResult> {
    const ticket = await this.ticketRepository.findByCode(code, year);
    if (!ticket) {
      return { status: 'invalid', codigo: code, ticket: null, message: 'Entrada no encontrada.' };
    }
    if (ticket.bloqueada) {
      return { status: 'blocked', codigo: code, ticket, message: 'Entrada bloqueada.' };
    }
    if (!ticket.activada) {
      return { status: 'inactive', codigo: code, ticket, message: 'Entrada pendiente de activar.' };
    }
    if (ticket.usada) {
      return { status: 'used', codigo: code, ticket, message: 'Entrada ya validada.' };
    }

    const validated = await this.ticketRepository.markValidated(code, year);
    return { status: 'valid', codigo: code, ticket: validated, message: 'Entrada valida.' };
  }
}
