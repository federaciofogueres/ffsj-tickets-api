import { customAlphabet } from 'nanoid';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const nanoid = customAlphabet(alphabet, 10);

export const createTicketCode = (prefix?: string): string => {
  const safePrefix = String(prefix || 'FFSJ').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10) || 'FFSJ';
  return `${safePrefix}-${nanoid()}`;
};

export const extractTicketCode = (value: unknown): string => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const url = new URL(trimmed);
      return (
        url.searchParams.get('code') ||
        url.searchParams.get('codigo') ||
        url.searchParams.get('ticket') ||
        decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '')
      ).trim().toUpperCase();
    } catch {
      return trimmed.toUpperCase();
    }
  }

  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return String(item.code || item.codigo || item.ticket || item.accessCode || '').trim().toUpperCase();
  }

  return '';
};

export const buildTicketQrUrl = (baseUrl: string, code: string): string => {
  const normalized = baseUrl.replace(/\/$/, '');
  return `${normalized}/validar?code=${encodeURIComponent(code)}`;
};
