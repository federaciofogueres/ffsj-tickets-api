import { randomUUID } from 'node:crypto';
import type { Pool } from 'mysql2/promise';

import { env } from '../config/env';
import type { Event } from '../types/domain';
import { AppError } from '../utils/app-error';
import { toIso, toMysqlDate, type Rows } from '../utils/mysql';

type EventRow = {
  id: string;
  year: string;
  nombre: string;
  descripcion: string | null;
  fecha_evento: Date | null;
  estado: 'activo' | 'finalizado';
  created_at: Date | null;
  updated_at: Date | null;
};

const serializeEvent = (row: EventRow): Event => ({
  id: row.id,
  year: row.year,
  nombre: row.nombre,
  descripcion: row.descripcion,
  fechaEvento: toIso(row.fecha_evento)?.slice(0, 10) ?? null,
  estado: row.estado,
  createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  updatedAt: toIso(row.updated_at) ?? new Date().toISOString()
});

export class EventRepository {
  constructor(private readonly pool: Pool) {}

  private safeYear(year?: string): string {
    return String(year || env.CAMPAIGN_YEAR).replace(/[^0-9]/g, '') || env.CAMPAIGN_YEAR;
  }

  async ensureDefault(year?: string): Promise<Event> {
    const safeYear = this.safeYear(year);
    const [rows] = await this.pool.execute<Rows<EventRow>>(
      'SELECT * FROM eventos WHERE year = ? ORDER BY created_at ASC, id ASC LIMIT 1',
      [safeYear]
    );
    if (rows[0]) {
      return serializeEvent(rows[0]);
    }
    return this.create({ nombre: 'Evento principal', descripcion: 'Evento creado automaticamente para tickets existentes.', estado: 'activo' }, safeYear);
  }

  async resolveEventId(eventId?: string | null, year?: string): Promise<string> {
    if (!eventId) {
      return (await this.ensureDefault(year)).id;
    }
    await this.findById(eventId, year);
    return eventId;
  }

  async list(year?: string): Promise<Event[]> {
    const [rows] = await this.pool.execute<Rows<EventRow>>(
      'SELECT * FROM eventos WHERE year = ? ORDER BY estado ASC, fecha_evento IS NULL ASC, fecha_evento ASC, created_at DESC',
      [this.safeYear(year)]
    );
    return rows.map(serializeEvent);
  }

  async findById(id: string, year?: string): Promise<Event> {
    const [rows] = await this.pool.execute<Rows<EventRow>>(
      'SELECT * FROM eventos WHERE id = ? AND year = ? LIMIT 1',
      [id, this.safeYear(year)]
    );
    if (!rows[0]) {
      throw new AppError('EVENT_NOT_FOUND', 404, 'El evento no existe');
    }
    return serializeEvent(rows[0]);
  }

  async create(input: { nombre: string; descripcion?: string | null; fechaEvento?: string | null; estado?: 'activo' | 'finalizado' }, year?: string): Promise<Event> {
    const id = randomUUID();
    const safeYear = this.safeYear(year);
    await this.pool.execute(
      `INSERT INTO eventos (id, year, nombre, descripcion, fecha_evento, estado)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        safeYear,
        input.nombre.trim(),
        input.descripcion?.trim() || null,
        input.fechaEvento ? toMysqlDate(input.fechaEvento) : null,
        input.estado ?? 'activo'
      ]
    );
    return this.findById(id, safeYear);
  }

  async update(id: string, input: { nombre?: string; descripcion?: string | null; fechaEvento?: string | null; estado?: 'activo' | 'finalizado' }, year?: string): Promise<Event> {
    const current = await this.findById(id, year);
    await this.pool.execute(
      `UPDATE eventos
       SET nombre = ?, descripcion = ?, fecha_evento = ?, estado = ?
       WHERE id = ? AND year = ?`,
      [
        input.nombre?.trim() || current.nombre,
        input.descripcion === undefined ? current.descripcion : input.descripcion?.trim() || null,
        input.fechaEvento === undefined ? (current.fechaEvento ? toMysqlDate(current.fechaEvento) : null) : input.fechaEvento ? toMysqlDate(input.fechaEvento) : null,
        input.estado ?? current.estado,
        id,
        this.safeYear(year)
      ]
    );
    return this.findById(id, year);
  }
}
