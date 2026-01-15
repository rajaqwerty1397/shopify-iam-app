import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import {
  NotFoundError,
  DuplicateResourceError,
} from '../../common/errors/index.js';
import {
  CreatePlanInput,
  UpdatePlanInput,
  ListPlansQuery,
} from './plans.schema.js';
import { Plan, Prisma } from '@prisma/client';

const logger = createModuleLogger('PlansService');

/**
 * Plans Service
 *
 * Handles all plan-related business logic.
 */
export class PlansService {
  /**
   * Create a new plan
   */
  async create(input: CreatePlanInput): Promise<Plan> {
    // Verify app platform exists
    const appPlatform = await prisma.appPlatform.findUnique({
      where: { id: input.appPlatformId },
    });

    if (!appPlatform) {
      throw new NotFoundError('AppPlatform');
    }

    // Check for duplicate name within the same app platform
    const existing = await prisma.plan.findFirst({
      where: {
        appPlatformId: input.appPlatformId,
        name: input.name,
      },
    });

    if (existing) {
      throw new DuplicateResourceError('Plan with this name already exists for this app platform');
    }

    const plan = await prisma.plan.create({
      data: {
        appPlatformId: input.appPlatformId,
        name: input.name,
        description: input.description,
        monthlyPrice: input.monthlyPrice,
        annualPrice: input.annualPrice,
        userLimit: input.userLimit,
        features: input.features as Prisma.JsonObject,
        trialDays: input.trialDays,
        isActive: input.isActive,
        displayOrder: input.displayOrder,
      },
    });

    logger.info({ planId: plan.id, name: plan.name }, 'Plan created');
    return plan;
  }

  /**
   * Get plan by ID
   */
  async findById(id: number): Promise<Plan> {
    const plan = await prisma.plan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundError('Plan');
    }

    return plan;
  }

  /**
   * List all plans
   */
  async list(query: ListPlansQuery): Promise<Plan[]> {
    const where: Prisma.PlanWhereInput = {};

    if (query.appPlatformId) {
      where.appPlatformId = query.appPlatformId;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return prisma.plan.findMany({
      where,
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  /**
   * Update a plan
   */
  async update(id: number, input: UpdatePlanInput): Promise<Plan> {
    // Verify plan exists
    const existingPlan = await this.findById(id);

    // Check for duplicate name if name is being updated
    if (input.name && input.name !== existingPlan.name) {
      const duplicate = await prisma.plan.findFirst({
        where: {
          appPlatformId: existingPlan.appPlatformId,
          name: input.name,
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new DuplicateResourceError('Plan with this name already exists for this app platform');
      }
    }

    const plan = await prisma.plan.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.monthlyPrice !== undefined && { monthlyPrice: input.monthlyPrice }),
        ...(input.annualPrice !== undefined && { annualPrice: input.annualPrice }),
        ...(input.userLimit !== undefined && { userLimit: input.userLimit }),
        ...(input.features !== undefined && { features: input.features as Prisma.JsonObject }),
        ...(input.trialDays !== undefined && { trialDays: input.trialDays }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
      },
    });

    logger.info({ planId: id }, 'Plan updated');
    return plan;
  }

  /**
   * Delete a plan
   */
  async delete(id: number): Promise<void> {
    // Verify plan exists
    await this.findById(id);

    await prisma.plan.delete({
      where: { id },
    });

    logger.info({ planId: id }, 'Plan deleted');
  }

  /**
   * Get all active plans for an app platform
   */
  async getActivePlansForAppPlatform(appPlatformId: number): Promise<Plan[]> {
    return prisma.plan.findMany({
      where: {
        appPlatformId,
        isActive: true,
      },
      orderBy: { displayOrder: 'asc' },
    });
  }
}

// Singleton instance
export const plansService = new PlansService();
