import { FastifyRequest, FastifyReply } from 'fastify';
import { platformsService } from './platforms.service.js';
import {
  CreatePlatformInput,
  UpdatePlatformInput,
  ListPlatformsQuery,
} from './platforms.schema.js';

/**
 * Platforms Controller
 *
 * HTTP handlers for platform endpoints.
 */
export class PlatformsController {
  /**
   * Create a new platform
   * POST /api/platforms
   */
  async create(
    request: FastifyRequest<{ Body: CreatePlatformInput }>,
    reply: FastifyReply
  ) {
    const platform = await platformsService.create(request.body);
    return reply.status(201).send(platform);
  }

  /**
   * Get platform by ID
   * GET /api/platforms/:id
   */
  async findById(
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply
  ) {
    const platform = await platformsService.findById(request.params.id);
    return reply.send(platform);
  }

  /**
   * List all platforms
   * GET /api/platforms
   */
  async list(
    request: FastifyRequest<{ Querystring: ListPlatformsQuery }>,
    reply: FastifyReply
  ) {
    const result = await platformsService.list(request.query);
    return reply.send(result);
  }

  /**
   * Update a platform
   * PATCH /api/platforms/:id
   */
  async update(
    request: FastifyRequest<{
      Params: { id: number };
      Body: UpdatePlatformInput;
    }>,
    reply: FastifyReply
  ) {
    const platform = await platformsService.update(request.params.id, request.body);
    return reply.send(platform);
  }

  /**
   * Delete a platform
   * DELETE /api/platforms/:id
   */
  async delete(
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply
  ) {
    await platformsService.delete(request.params.id);
    return reply.status(204).send();
  }
}

// Singleton instance
export const platformsController = new PlatformsController();
