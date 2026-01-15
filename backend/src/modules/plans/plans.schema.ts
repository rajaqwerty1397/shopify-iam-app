import { z } from 'zod';
import { intIdSchema } from '../../common/schemas/index.js';

/**
 * Plans Module Schemas
 */

// =============================================================================
// Request Schemas
// =============================================================================

export const createPlanSchema = z.object({
  appPlatformId: intIdSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  monthlyPrice: z.number().min(0).default(0),
  annualPrice: z.number().min(0).default(0),
  userLimit: z.number().int().default(-1), // -1 = unlimited
  features: z.record(z.unknown()).optional(),
  trialDays: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  monthlyPrice: z.number().min(0).optional(),
  annualPrice: z.number().min(0).optional(),
  userLimit: z.number().int().optional(),
  features: z.record(z.unknown()).optional().nullable(),
  trialDays: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

export const listPlansQuerySchema = z.object({
  appPlatformId: intIdSchema.optional(),
  isActive: z.coerce.boolean().optional(),
});

export const planIdParamSchema = z.object({
  id: intIdSchema,
});

// =============================================================================
// Response Schemas
// =============================================================================

export const planResponseSchema = z.object({
  id: z.number().int(),
  appPlatformId: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  monthlyPrice: z.number(),
  annualPrice: z.number(),
  userLimit: z.number(),
  features: z.record(z.unknown()).nullable(),
  trialDays: z.number(),
  isActive: z.boolean(),
  displayOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const planListResponseSchema = z.array(planResponseSchema);

// =============================================================================
// Types
// =============================================================================

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;
export type PlanResponse = z.infer<typeof planResponseSchema>;
