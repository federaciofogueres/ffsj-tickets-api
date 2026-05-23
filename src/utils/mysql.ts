import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export type Rows<T> = Array<T & RowDataPacket>;

export const bool = (value: unknown): boolean => value === true || value === 1 || value === '1';

export const toIso = (value: Date | string | number | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const toMysqlDate = (value: Date | string | number | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const affectedRows = (result: unknown): number => (result as ResultSetHeader).affectedRows ?? 0;
