import nodemailer from 'nodemailer';

import { env } from '../config/env';
import type { TicketEmailResult } from '../types/domain';
import type { Ticket } from '../types/domain';
import { AppError } from '../utils/app-error';
import type { TicketRepository } from '../repositories/ticket.repository';
import type { TicketPdfService } from './ticket-pdf.service';

export class TicketEmailService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly ticketPdfService: TicketPdfService
  ) {}

  async sendTickets(input: { email: string; code?: string; batchId?: string; eventId?: string | null }, year?: string): Promise<TicketEmailResult> {
    if (!env.SMTP_HOST || (!env.SMTP_FROM && !env.SMTP_USER)) {
      throw new AppError('EMAIL_NOT_CONFIGURED', 500, 'El envio de emails no esta configurado.');
    }
    if (Boolean(input.code) === Boolean(input.batchId)) {
      throw new AppError('TICKET_EMAIL_TARGET_REQUIRED', 400, 'Indica un ticket o un lote, no ambos.');
    }

    const tickets: Ticket[] = input.code
      ? [await this.ticketRepository.findByCode(input.code, year, input.eventId)].filter((ticket): ticket is Ticket => ticket !== null)
      : await this.ticketRepository.findByBatch(input.batchId!, year, input.eventId);

    if (!tickets.length) {
      throw new AppError('TICKET_NOT_FOUND', 404, 'No se han encontrado entradas para enviar.');
    }

    const pdf = await this.ticketPdfService.createTicketsPdf(tickets);
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
    });

    await transporter.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: input.email,
      subject: tickets.length === 1 ? 'Tu entrada FFSJ' : `Tus ${tickets.length} entradas FFSJ`,
      text: tickets.map((ticket) => `${ticket.codigo}\n${ticket.qrUrl ?? ''}`).join('\n\n'),
      html: `<h1>Entradas FFSJ</h1>${tickets.map((ticket) => `<p><strong>${ticket.codigo}</strong><br><a href="${ticket.qrUrl ?? ''}">Abrir entrada</a></p>`).join('')}`,
      attachments: [{ filename: input.batchId ? `entradas-${input.batchId}.pdf` : `entrada-${tickets[0].codigo}.pdf`, content: pdf, contentType: 'application/pdf' }]
    });

    return { sent: tickets.length, email: input.email, batchId: input.batchId ?? tickets[0].batchId };
  }
}
