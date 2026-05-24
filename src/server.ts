import { env } from './config/env';
import { pool } from './config/mysql';
import { createApp } from './app';
import { TicketRepository } from './repositories/ticket.repository';
import { TrackingRepository } from './repositories/tracking.repository';
import { EventRepository } from './repositories/event.repository';
import { TicketEmailService } from './services/ticket-email.service';
import { TicketPdfService } from './services/ticket-pdf.service';
import { TicketService } from './services/ticket.service';

const eventRepository = new EventRepository(pool);
const ticketRepository = new TicketRepository(pool, eventRepository);
const trackingRepository = new TrackingRepository(pool);
const ticketPdfService = new TicketPdfService();
const services = {
  ticketRepository,
  eventRepository,
  trackingRepository,
  ticketPdfService,
  ticketService: new TicketService(ticketRepository),
  ticketEmailService: new TicketEmailService(ticketRepository, ticketPdfService)
};

createApp(services).listen(env.PORT, () => {
  console.log(`FFSJ Tickets API listening on ${env.PORT}`);
});
