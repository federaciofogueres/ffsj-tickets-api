import type { Pool } from 'mysql2/promise';

import { env } from '../config/env';
import type { AdminStats, PaginatedResult, Ticket } from '../types/domain';
import { AppError } from '../utils/app-error';
import { affectedRows, bool, toIso, toMysqlDate, type Rows } from '../utils/mysql';

type TicketRow = {
  year: string;
  codigo: string;
  activada: number;
  activada_at: Date | null;
  usada: number;
  usada_at: Date | null;
  bloqueada: number;
  fisica: number;
  validated_at: Date | null;
  batch_id: string | null;
  qr_url: string | null;
  created_at: Date | null;
};

const serializeTicket = (row: TicketRow): Ticket => ({
  codigo: row.codigo,
  activada: bool(row.activada),
  activadaAt: toIso(row.activada_at),
  usada: bool(row.usada),
  usadaAt: toIso(row.usada_at),
  bloqueada: bool(row.bloqueada),
  fisica: bool(row.fisica),
  validatedAt: toIso(row.validated_at),
  createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  batchId: row.batch_id,
  qrUrl: row.qr_url
});

export class TicketRepository {
  constructor(private readonly pool: Pool) {}

  private safeYear(year?: string): string {
    return String(year || env.CAMPAIGN_YEAR).replace(/[^0-9]/g, '') || env.CAMPAIGN_YEAR;
  }

  async create(input: { codigo: string; activada?: boolean; bloqueada?: boolean; fisica?: boolean; qrUrl?: string | null }, year?: string): Promise<Ticket> {
    if (await this.exists(input.codigo, year)) {
      throw new AppError('TICKET_EXISTS', 409, 'La entrada ya existe');
    }

    const now = new Date().toISOString();
    const ticket: Ticket = {
      codigo: input.codigo.trim().toUpperCase(),
      activada: Boolean(input.activada),
      activadaAt: input.activada ? now : null,
      usada: false,
      usadaAt: null,
      bloqueada: Boolean(input.bloqueada),
      fisica: Boolean(input.fisica),
      validatedAt: null,
      createdAt: now,
      batchId: null,
      qrUrl: input.qrUrl ?? null
    };
    await this.insert(ticket, this.safeYear(year));
    return ticket;
  }

  async createMany(tickets: Ticket[], year?: string): Promise<void> {
    const safeYear = this.safeYear(year);
    for (const ticket of tickets) {
      await this.insert(ticket, safeYear);
    }
  }

  private async insert(ticket: Ticket, year: string): Promise<void> {
    await this.pool.execute(
      `INSERT INTO tickets (
        year, codigo, activada, activada_at, usada, usada_at, bloqueada,
        fisica, validated_at, batch_id, qr_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        year,
        ticket.codigo,
        ticket.activada ? 1 : 0,
        toMysqlDate(ticket.activadaAt),
        ticket.usada ? 1 : 0,
        toMysqlDate(ticket.usadaAt),
        ticket.bloqueada ? 1 : 0,
        ticket.fisica ? 1 : 0,
        toMysqlDate(ticket.validatedAt),
        ticket.batchId,
        ticket.qrUrl,
        toMysqlDate(ticket.createdAt)
      ]
    );
  }

  async exists(code: string, year?: string): Promise<boolean> {
    const [rows] = await this.pool.execute<Rows<{ found: number }>>(
      'SELECT 1 AS found FROM tickets WHERE year = ? AND codigo = ? LIMIT 1',
      [this.safeYear(year), code.trim().toUpperCase()]
    );
    return rows.length > 0;
  }

  async findByCode(code: string, year?: string): Promise<Ticket | null> {
    const [rows] = await this.pool.execute<Rows<TicketRow>>(
      'SELECT * FROM tickets WHERE year = ? AND codigo = ? LIMIT 1',
      [this.safeYear(year), code.trim().toUpperCase()]
    );
    return rows[0] ? serializeTicket(rows[0]) : null;
  }

  async findByBatch(batchId: string, year?: string): Promise<Ticket[]> {
    const [rows] = await this.pool.execute<Rows<TicketRow>>(
      'SELECT * FROM tickets WHERE year = ? AND batch_id = ? ORDER BY codigo ASC',
      [this.safeYear(year), batchId]
    );
    return rows.map(serializeTicket);
  }

  async list(params: { limit: number; cursor?: string; status?: string; search?: string; mode?: 'single' | 'batch' }, year?: string): Promise<PaginatedResult<Ticket>> {
    const values: Array<string | number | Date> = [this.safeYear(year)];
    const clauses = ['year = ?'];

    if (params.status === 'inactive') clauses.push('activada = 0');
    if (params.status === 'activated') clauses.push('activada = 1 AND usada = 0 AND bloqueada = 0');
    if (params.status === 'validated') clauses.push('usada = 1');
    if (params.status === 'blocked') clauses.push('bloqueada = 1');
    if (params.mode === 'single') clauses.push('batch_id IS NULL');
    if (params.mode === 'batch') clauses.push('batch_id IS NOT NULL');
    if (params.search?.trim()) {
      clauses.push('(codigo LIKE ? OR batch_id LIKE ?)');
      values.push(`%${params.search.trim()}%`, `%${params.search.trim()}%`);
    }
    if (params.cursor) {
      clauses.push('created_at < ?');
      values.push(new Date(params.cursor));
    }

    values.push(Math.min(Math.max(Number(params.limit || 25), 1), 100) + 1);
    const [rows] = await this.pool.execute<Rows<TicketRow>>(
      `SELECT * FROM tickets WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, codigo DESC LIMIT ?`,
      values
    );
    const itemRows = rows.slice(0, Number(values.at(-1)) - 1);

    return {
      items: itemRows.map(serializeTicket),
      nextCursor: rows.length > itemRows.length ? toIso(itemRows.at(-1)?.created_at) : null
    };
  }

  async update(code: string, input: { activada?: boolean; bloqueada?: boolean }, year?: string): Promise<Ticket> {
    const ticket = await this.findByCode(code, year);
    if (!ticket) {
      throw new AppError('TICKET_NOT_FOUND', 404, 'La entrada no existe');
    }

    const activada = input.activada ?? ticket.activada;
    const activadaAt = input.activada === undefined ? ticket.activadaAt : input.activada ? ticket.activadaAt ?? new Date().toISOString() : null;
    await this.pool.execute(
      'UPDATE tickets SET activada = ?, activada_at = ?, bloqueada = ? WHERE year = ? AND codigo = ?',
      [activada ? 1 : 0, toMysqlDate(activadaAt), (input.bloqueada ?? ticket.bloqueada) ? 1 : 0, this.safeYear(year), ticket.codigo]
    );
    return (await this.findByCode(code, year))!;
  }

  async markValidated(code: string, year?: string): Promise<Ticket> {
    const ticket = await this.findByCode(code, year);
    if (!ticket) {
      throw new AppError('TICKET_NOT_FOUND', 404, 'La entrada no existe');
    }
    if (ticket.bloqueada) {
      throw new AppError('TICKET_BLOCKED', 409, 'La entrada esta bloqueada');
    }
    if (!ticket.activada) {
      throw new AppError('TICKET_INACTIVE', 409, 'La entrada no esta activada');
    }
    if (ticket.usada) {
      throw new AppError('TICKET_USED', 409, 'La entrada ya fue validada');
    }

    const now = new Date().toISOString();
    await this.pool.execute(
      'UPDATE tickets SET usada = 1, usada_at = ?, validated_at = ? WHERE year = ? AND codigo = ?',
      [toMysqlDate(now), toMysqlDate(now), this.safeYear(year), ticket.codigo]
    );
    return (await this.findByCode(code, year))!;
  }

  async activateBatch(batchId: string, year?: string): Promise<{ batchId: string; total: number; activatedCount: number; changedCount: number; remainingInactive: number }> {
    const safeYear = this.safeYear(year);
    const [totalRows] = await this.pool.execute<Rows<{ total: number }>>('SELECT COUNT(*) AS total FROM tickets WHERE year = ? AND batch_id = ?', [safeYear, batchId]);
    const total = Number(totalRows[0]?.total ?? 0);
    if (!total) throw new AppError('TICKET_BATCH_NOT_FOUND', 404, 'No se ha encontrado ningun lote con ese identificador');
    const [result] = await this.pool.execute('UPDATE tickets SET activada = 1, activada_at = COALESCE(activada_at, CURRENT_TIMESTAMP(3)) WHERE year = ? AND batch_id = ? AND activada = 0', [safeYear, batchId]);
    const [activeRows] = await this.pool.execute<Rows<{ total: number }>>('SELECT COUNT(*) AS total FROM tickets WHERE year = ? AND batch_id = ? AND activada = 1', [safeYear, batchId]);
    const activatedCount = Number(activeRows[0]?.total ?? 0);
    return { batchId, total, activatedCount, changedCount: affectedRows(result), remainingInactive: total - activatedCount };
  }

  async delete(code: string, year?: string): Promise<void> {
    const ticket = await this.findByCode(code, year);
    if (!ticket) throw new AppError('TICKET_NOT_FOUND', 404, 'La entrada no existe');
    if (ticket.usada) throw new AppError('TICKET_USED', 409, 'No se puede eliminar una entrada validada');
    await this.pool.execute('DELETE FROM tickets WHERE year = ? AND codigo = ?', [this.safeYear(year), ticket.codigo]);
  }

  async deleteBatch(batchId: string, year?: string): Promise<{ batchId: string; deleted: number; validatedTickets: string[] }> {
    const tickets = await this.findByBatch(batchId, year);
    if (!tickets.length) throw new AppError('TICKET_BATCH_NOT_FOUND', 404, 'No se ha encontrado ningun lote con ese identificador');
    const validatedTickets = tickets.filter((ticket) => ticket.usada).map((ticket) => ticket.codigo);
    if (validatedTickets.length) throw new AppError('TICKET_BATCH_HAS_VALIDATED', 409, 'El lote tiene entradas ya validadas', { validatedTickets });
    const [result] = await this.pool.execute('DELETE FROM tickets WHERE year = ? AND batch_id = ?', [this.safeYear(year), batchId]);
    return { batchId, deleted: affectedRows(result), validatedTickets };
  }

  async exportAll(year?: string): Promise<Ticket[]> {
    const [rows] = await this.pool.execute<Rows<TicketRow>>('SELECT * FROM tickets WHERE year = ? ORDER BY created_at DESC, codigo DESC', [this.safeYear(year)]);
    return rows.map(serializeTicket);
  }

  async stats(year?: string): Promise<AdminStats> {
    const safeYear = this.safeYear(year);
    const [rows] = await this.pool.execute<Rows<AdminStats>>(
      `SELECT
        COUNT(*) AS totalEntradas,
        SUM(CASE WHEN activada = 1 THEN 1 ELSE 0 END) AS totalActivadas,
        SUM(CASE WHEN usada = 1 THEN 1 ELSE 0 END) AS totalValidadas,
        SUM(CASE WHEN bloqueada = 1 THEN 1 ELSE 0 END) AS totalBloqueadas,
        COUNT(DISTINCT batch_id) AS totalLotes
      FROM tickets WHERE year = ?`,
      [safeYear]
    );
    return {
      totalEntradas: Number(rows[0]?.totalEntradas ?? 0),
      totalActivadas: Number(rows[0]?.totalActivadas ?? 0),
      totalValidadas: Number(rows[0]?.totalValidadas ?? 0),
      totalBloqueadas: Number(rows[0]?.totalBloqueadas ?? 0),
      totalLotes: Number(rows[0]?.totalLotes ?? 0)
    };
  }
}
