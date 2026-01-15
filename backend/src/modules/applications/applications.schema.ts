import { z } from 'zod';
import {
  intIdSchema,
  applicationStatusSchema,
} from '../../common/schemas/index.js';

/**
 * Applications Module Schemas
 */

// =============================================================================
// Request Schemas
// =============================================================================

export const createApplicationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().url().max(500).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const updateApplicationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  iconUrl: z.string().url().max(500).optional().nullable(),
  status: applicationStatusSchema.optional(),
  settings: z.record(z.unknown()).optional().nullable(),
});

export const listApplicationsQuerySchema = z.object({
  status: applicationStatusSchema.optional(),
});

export const applicationIdParamSchema = z.object({
  id: intIdSchema,
});

// =============================================================================
// Response Schemas
// =============================================================================

export const applicationResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  iconUrl: z.string().nullable(),
  status: applicationStatusSchema,
  settings: z.record(z.unknown()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const applicationListResponseSchema = z.array(applicationResponseSchema);

// =============================================================================
// Types
// =============================================================================

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
export type ApplicationResponse = z.infer<typeof applicationResponseSchema>;
