import { FastifyRequest, FastifyReply } from 'fastify';
import { storesService } from './stores.service.js';
import {
  CreateStoreInput,
  UpdateStoreInput,
  ListStoresQuery,
} from './stores.schema.js';

/**
 * Stores Controller
 *
 * HTTP handlers for store endpoints.
 */
export class StoresController {
  /**
   * Create a new store
   * POST /api/stores
   */
  async create(
    request: FastifyRequest<{ Body: CreateStoreInput }>,
    reply: FastifyReply
  ) {
    const store = await storesService.create(request.body);
    return reply.status(201).send(store);
  }

  /**
   * Get store by ID
   * GET /api/stores/:id
   */
  async findById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const store = await storesService.findById(request.params.id);
    return reply.send(store);
  }

  /**
   * Get store with subscription
   * GET /api/stores/:id/subscription
   */
  async findByIdWithSubscription(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const store = await storesService.findByIdWithSubscription(request.params.id);
    return reply.send(store);
  }

  /**
   * List all stores
   * GET /api/stores
   */
  async list(
    request: FastifyRequest<{ Querystring: ListStoresQuery }>,
    reply: FastifyReply
  ) {
    const result = await storesService.list(request.query);
    return reply.send(result);
  }

  /**
   * Update a store
   * PATCH /api/stores/:id
   */
  async update(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateStoreInput;
    }>,
    reply: FastifyReply
  ) {
    const store = await storesService.update(request.params.id, request.body);
    return reply.send(store);
  }

  /**
   * Delete (uninstall) a store
   * DELETE /api/stores/:id
   */
  async delete(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    await storesService.delete(request.params.id);
    return reply.status(204).send();
  }
}

// Singleton instance
export const storesController = new StoresController();
