export interface Ticket {
  codigo: string;
  activada: boolean;
  activadaAt: string | null;
  usada: boolean;
  usadaAt: string | null;
  bloqueada: boolean;
  fisica: boolean;
  createdAt: string;
  validatedAt: string | null;
  batchId: string | null;
  qrUrl: string | null;
}

export interface TicketBatchResult {
  batchId: string;
  totalGenerated: number;
  fisica: boolean;
  tickets: Array<{ codigo: string; qrUrl: string; fisica: boolean }>;
}

export interface TicketEmailResult {
  sent: number;
  email: string;
  batchId: string | null;
}

export type TicketValidationStatus = 'valid' | 'invalid' | 'inactive' | 'blocked' | 'used';

export interface TicketValidationResult {
  status: TicketValidationStatus;
  codigo: string;
  message: string;
  ticket: Ticket | null;
  summary?: {
    type: 'ticket' | 'batch';
    total: number;
    validatedNow: number;
    alreadyValidated: number;
    inactive: number;
    blocked: number;
    validatedAt: string | null;
  };
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

export interface AdminStats {
  totalEntradas: number;
  totalActivadas: number;
  totalValidadas: number;
  totalBloqueadas: number;
  totalLotes: number;
}

export interface TrackingLog {
  id: number;
  year: string;
  action: string;
  actorId: string | null;
  actorLabel: string | null;
  ip: string | null;
  method: string;
  path: string;
  targetType: string | null;
  targetId: string | null;
  status: string;
  message: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AppServices {
  ticketRepository: import('../repositories/ticket.repository').TicketRepository;
  trackingRepository: import('../repositories/tracking.repository').TrackingRepository;
  ticketService: import('../services/ticket.service').TicketService;
  ticketEmailService: import('../services/ticket-email.service').TicketEmailService;
  ticketPdfService: import('../services/ticket-pdf.service').TicketPdfService;
}
