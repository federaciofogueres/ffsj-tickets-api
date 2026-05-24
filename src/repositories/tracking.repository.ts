import type { Pool } from 'mysql2/promise';

import { env } from '../config/env';
import type { PaginatedResult, TrackingLog } from '../types/domain';
import { AppError } from '../utils/app-error';
import { toIso, type Rows } from '../utils/mysql';

type TrackingLogRow = {
  id: number;
  year: string;
  action: string;
  actor_id: string | null;
  actor_label: string | null;
  ip: string | null;
  method: string;
  path: string;
  target_type: string | null;
  target_id: string | null;
  status: string;
  message: string | null;
  metadata: string | object | null;
  created_at: Date | null;
};

const parseMetadata = (value: TrackingLogRow['metadata']): unknown => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const serializeLog = (row: TrackingLogRow): TrackingLog => ({
  id: Number(row.id),
  year: row.year,
  action: row.action,
  actorId: row.actor_id,
  actorLabel: row.actor_label,
  ip: row.ip,
  method: row.method,
  path: row.path,
  targetType: row.target_type,
  targetId: row.target_id,
  status: row.status,
  message: row.message,
  metadata: parseMetadata(row.metadata),
  createdAt: toIso(row.created_at) ?? new Date().toISOString()
});

export class TrackingRepository {
  constructor(private readonly pool: Pool) {}

  private safeYear(year?: string): string {
    return String(year || env.CAMPAIGN_YEAR).replace(/[^0-9]/g, '') || env.CAMPAIGN_YEAR;
  }

  async create(input: {
    year?: string;
    action: string;
    actorId?: string | null;
    actorLabel?: string | null;
    ip?: string | null;
    method: string;
    path: string;
    targetType?: string | null;
    targetId?: string | null;
    status?: string;
    message?: string | null;
    metadata?: unknown;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO tracking_logs (
        year, action, actor_id, actor_label, ip, method, path, target_type,
        target_id, status, message, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        this.safeYear(input.year),
        input.action,
        input.actorId ?? null,
        input.actorLabel ?? null,
        input.ip ?? null,
        input.method,
        input.path,
        input.targetType ?? null,
        input.targetId ?? null,
        input.status ?? 'ok',
        input.message ?? null,
        JSON.stringify(input.metadata ?? null)
      ]
    );
  }

  async list(params: {
    year?: string;
    limit: number;
    cursor?: string;
    search?: string;
    action?: string;
    actor?: string;
    ip?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<PaginatedResult<TrackingLog>> {
    const values: Array<string | number | Date> = [this.safeYear(params.year)];
    const clauses = ['year = ?'];

    if (params.action?.trim()) {
      clauses.push('action = ?');
      values.push(params.action.trim());
    }
    if (params.actor?.trim()) {
      clauses.push('(actor_id LIKE ? OR actor_label LIKE ?)');
      values.push(`%${params.actor.trim()}%`, `%${params.actor.trim()}%`);
    }
    if (params.ip?.trim()) {
      clauses.push('ip LIKE ?');
      values.push(`%${params.ip.trim()}%`);
    }
    if (params.dateFrom?.trim()) {
      clauses.push('created_at >= ?');
      values.push(new Date(`${params.dateFrom.trim()}T00:00:00.000Z`));
    }
    if (params.dateTo?.trim()) {
      clauses.push('created_at <= ?');
      values.push(new Date(`${params.dateTo.trim()}T23:59:59.999Z`));
    }
    if (params.search?.trim()) {
      clauses.push('(action LIKE ? OR actor_id LIKE ? OR actor_label LIKE ? OR ip LIKE ? OR target_id LIKE ? OR message LIKE ?)');
      const search = `%${params.search.trim()}%`;
      values.push(search, search, search, search, search, search);
    }
    if (params.cursor) {
      clauses.push('created_at < ?');
      values.push(new Date(params.cursor));
    }

    const limit = Math.min(Math.max(Number(params.limit || 25), 1), 100) + 1;
    values.push(limit);
    const [rows] = await this.pool.execute<Rows<TrackingLogRow>>(
      `SELECT * FROM tracking_logs WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`,
      values
    );
    const itemRows = rows.slice(0, limit - 1);

    return {
      items: itemRows.map(serializeLog),
      nextCursor: rows.length > itemRows.length ? toIso(itemRows.at(-1)?.created_at) : null
    };
  }

  async findById(id: number, year?: string): Promise<TrackingLog> {
    const [rows] = await this.pool.execute<Rows<TrackingLogRow>>(
      'SELECT * FROM tracking_logs WHERE year = ? AND id = ? LIMIT 1',
      [this.safeYear(year), id]
    );
    if (!rows[0]) {
      throw new AppError('TRACKING_LOG_NOT_FOUND', 404, 'No se ha encontrado el evento de tracking');
    }
    return serializeLog(rows[0]);
  }

  async actions(year?: string): Promise<string[]> {
    const [rows] = await this.pool.execute<Rows<{ action: string }>>(
      'SELECT DISTINCT action FROM tracking_logs WHERE year = ? ORDER BY action ASC',
      [this.safeYear(year)]
    );
    return rows.map((row) => row.action);
  }
}
