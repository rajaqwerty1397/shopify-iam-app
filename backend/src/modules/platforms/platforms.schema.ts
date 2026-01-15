import { z } from 'zod';
import {
  intIdSchema,
  platformStatusSchema,
} from '../../common/schemas/index.js';

/**
 * Platforms Module Schemas
 */

// =============================================================================
// Request Schemas
// =============================================================================

export const createPlatformSchema = z.object({
  name: z.string().min(1).max(100),
  config: z.record(z.unknown()).optional(),
});

export const updatePlatformSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: platformStatusSchema.optional(),
  config: z.record(z.unknown()).optional(),
});

export const listPlatformsQuerySchema = z.object({
  status: platformStatusSchema.optional(),
});

export const platformIdParamSchema = z.object({
  id: intIdSchema,
});

// =============================================================================
// Response Schemas
// =============================================================================

export const platformResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  status: platformStatusSchema,
  config: z.record(z.unknown()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const platformListResponseSchema = z.array(platformResponseSchema);

// =============================================================================
// Types
// =============================================================================

export type CreatePlatformInput = z.infer<typeof createPlatformSchema>;
export type UpdatePlatformInput = z.infer<typeof updatePlatformSchema>;
export type ListPlatformsQuery = z.infer<typeof listPlatformsQuerySchema>;
export type PlatformResponse = z.infer<typeof platformResponseSchema>;
