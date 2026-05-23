import { Router } from 'express';

import { createAdminController } from '../controllers/admin.controller';
import { adminAuthMiddleware } from '../middlewares/admin-auth.middleware';
import { asyncHandler } from '../middlewares/async-handler';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.middleware';
import type { AppServices } from '../types/domain';
import {
  batchIdSchema,
  createTicketSchema,
  generateTicketsSchema,
  listTicketsQuerySchema,
  ticketCodeSchema,
  ticketEmailSchema,
  updateTicketSchema,
  validateTicketSchema,
  yearQuerySchema
} from '../validators/admin.validator';

export const createAdminRouter = (services: AppServices): Router => {
  const router = Router();
  const controller = createAdminController(services);

  router.use(adminAuthMiddleware);
  router.get('/me', asyncHandler(controller.me));
  router.get('/stats', validateQuery(yearQuerySchema), asyncHandler(controller.stats));
  router.post('/validate', validateQuery(yearQuerySchema), validateBody(validateTicketSchema), asyncHandler(controller.validateTicket));
  router.post('/tickets/generate', validateQuery(yearQuerySchema), validateBody(generateTicketsSchema), asyncHandler(controller.generateTickets));
  router.post('/tickets/email', validateQuery(yearQuerySchema), validateBody(ticketEmailSchema), asyncHandler(controller.sendTicketsByEmail));
  router.get('/tickets/export', validateQuery(yearQuerySchema), asyncHandler(controller.exportTickets));
  router.get('/tickets/pdf', asyncHandler(controller.downloadTicketsPdf));
  router.put('/tickets/batch/:batchId/activate', validateQuery(yearQuerySchema), validateParams(batchIdSchema), asyncHandler(controller.activateTicketBatch));
  router.delete('/tickets/batch/:batchId', validateQuery(yearQuerySchema), validateParams(batchIdSchema), asyncHandler(controller.deleteTicketBatch));
  router.get('/tickets/:codigo', validateQuery(yearQuerySchema), validateParams(ticketCodeSchema), asyncHandler(controller.getTicket));
  router.get('/tickets', validateQuery(listTicketsQuerySchema), asyncHandler(controller.listTickets));
  router.post('/tickets', validateQuery(yearQuerySchema), validateBody(createTicketSchema), asyncHandler(controller.createTicket));
  router.put('/tickets/:codigo', validateQuery(yearQuerySchema), validateParams(ticketCodeSchema), validateBody(updateTicketSchema), asyncHandler(controller.updateTicket));
  router.delete('/tickets/:codigo', validateQuery(yearQuerySchema), validateParams(ticketCodeSchema), asyncHandler(controller.deleteTicket));

  return router;
};
