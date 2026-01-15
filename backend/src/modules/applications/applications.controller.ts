import { FastifyRequest, FastifyReply } from 'fastify';
import { applicationsService } from './applications.service.js';
import {
  CreateApplicationInput,
  UpdateApplicationInput,
  ListApplicationsQuery,
} from './applications.schema.js';

/**
 * Applications Controller
 *
 * HTTP handlers for application endpoints.
 */
export class ApplicationsController {
  /**
   * Create a new application
   * POST /api/applications
   */
  async create(
    request: FastifyRequest<{ Body: CreateApplicationInput }>,
    reply: FastifyReply
  ) {
    const application = await applicationsService.create(request.body);
    return reply.status(201).send(application);
  }

  /**
   * Get application by ID
   * GET /api/applications/:id
   */
  async findById(
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply
  ) {
    const application = await applicationsService.findById(request.params.id);
    return reply.send(application);
  }

  /**
   * List all applications
   * GET /api/applications
   */
  async list(
    request: FastifyRequest<{ Querystring: ListApplicationsQuery }>,
    reply: FastifyReply
  ) {
    const result = await applicationsService.list(request.query);
    return reply.send(result);
  }

  /**
   * Update an application
   * PATCH /api/applications/:id
   */
  async update(
    request: FastifyRequest<{
      Params: { id: number };
      Body: UpdateApplicationInput;
    }>,
    reply: FastifyReply
  ) {
    const application = await applicationsService.update(request.params.id, request.body);
    return reply.send(application);
  }

  /**
   * Delete an application
   * DELETE /api/applications/:id
   */
  async delete(
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply
  ) {
    await applicationsService.delete(request.params.id);
    return reply.status(204).send();
  }
}

// Singleton instance
export const applicationsController = new ApplicationsController();
