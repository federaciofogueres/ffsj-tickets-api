import { describe, expect, it } from 'vitest';

import type { Ticket } from '../types/domain';
import { TicketService } from './ticket.service';

const baseTicket = (codigo: string, eventId: string): Ticket => ({
  eventId,
  codigo,
  activada: true,
  activadaAt: new Date().toISOString(),
  usada: false,
  usadaAt: null,
  bloqueada: false,
  fisica: false,
  createdAt: new Date().toISOString(),
  validatedAt: null,
  batchId: null,
  qrUrl: null
});

describe('TicketService event context', () => {
  it('generates tickets associated with the selected event', async () => {
    const calls: Array<{ year?: string; eventId?: string | null; total: number }> = [];
    const service = new TicketService({
      exists: async () => false,
      createMany: async (tickets: Ticket[], year?: string, eventId?: string | null) => {
        calls.push({ year, eventId, total: tickets.length });
      }
    } as any);

    const result = await service.generateBatch({ quantity: 2, prefix: 'EVT', year: '2026', eventId: 'event-a' });

    expect(result.totalGenerated).toBe(2);
    expect(calls).toEqual([{ year: '2026', eventId: 'event-a', total: 2 }]);
  });

  it('validates tickets inside the selected event only', async () => {
    const repositoryCalls: Array<{ method: string; eventId?: string | null }> = [];
    const service = new TicketService({
      findByCode: async (_code: string, _year?: string, eventId?: string | null) => {
        repositoryCalls.push({ method: 'findByCode', eventId });
        return baseTicket('A1', String(eventId));
      },
      markValidated: async (_code: string, _year?: string, eventId?: string | null) => {
        repositoryCalls.push({ method: 'markValidated', eventId });
        return { ...baseTicket('A1', String(eventId)), usada: true, usadaAt: new Date().toISOString(), validatedAt: new Date().toISOString() };
      }
    } as any);

    const result = await service.validate('A1', '2026', 'event-b');

    expect(result.status).toBe('valid');
    expect(repositoryCalls).toEqual([
      { method: 'findByCode', eventId: 'event-b' },
      { method: 'markValidated', eventId: 'event-b' }
    ]);
  });
});
