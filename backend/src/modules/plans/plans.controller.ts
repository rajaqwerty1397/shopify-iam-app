import { FastifyRequest, FastifyReply } from 'fastify';
import { plansService } from './plans.service.js';
import {
  CreatePlanInput,
  UpdatePlanInput,
  ListPlansQuery,
} from './plans.schema.js';

/**
 * Plans Controller
 *
 * HTTP handlers for plan endpoints.
 */
export class PlansController {
  /**
   * Create a new plan
   * POST /api/plans
   */
  async create(
    request: FastifyRequest<{ Body: CreatePlanInput }>,
    reply: FastifyReply
  ) {
    const plan = await plansService.create(request.body);
    return reply.status(201).send(plan);
  }

  /**
   * Get plan by ID
   * GET /api/plans/:id
   */
  async findById(
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply
  ) {
    const plan = await plansService.findById(request.params.id);
    return reply.send(plan);
  }

  /**
   * List all plans
   * GET /api/plans
   */
  async list(
    request: FastifyRequest<{ Querystring: ListPlansQuery }>,
    reply: FastifyReply
  ) {
    const result = await plansService.list(request.query);
    return reply.send(result);
  }

  /**
   * Update a plan
   * PATCH /api/plans/:id
   */
  async update(
    request: FastifyRequest<{
      Params: { id: number };
      Body: UpdatePlanInput;
    }>,
    reply: FastifyReply
  ) {
    const plan = await plansService.update(request.params.id, request.body);
    return reply.send(plan);
  }

  /**
   * Delete a plan
   * DELETE /api/plans/:id
   */
  async delete(
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply
  ) {
    await plansService.delete(request.params.id);
    return reply.status(204).send();
  }
}

// Singleton instance
export const plansController = new PlansController();
