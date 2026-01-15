import { z } from 'zod';
import {
  uuidSchema,
  intIdSchema,
  paginationSchema,
  sortSchema,
  storeStatusSchema,
} from '../../common/schemas/index.js';

/**
 * Stores Module Schemas
 */

// =============================================================================
// Request Schemas
// =============================================================================

export const createStoreSchema = z.object({
  appPlatformId: intIdSchema,
  platformStoreId: z.string().min(1).max(100),
  domain: z.string().min(1).max(255).regex(/\.myshopify\.com$/, 'Must be a valid Shopify domain'),
  name: z.string().min(1).max(255),
  ownerEmail: z.string().email().max(255),
  accessToken: z.string().min(1),
  multipassSecret: z.string().optional(),
  isPlus: z.boolean().default(false),
  country: z.string().max(10).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateStoreSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  ownerEmail: z.string().email().max(255).optional(),
  accessToken: z.string().min(1).optional(),
  multipassSecret: z.string().optional(),
  isPlus: z.boolean().optional(),
  country: z.string().max(10).optional(),
  status: storeStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const listStoresQuerySchema = paginationSchema.merge(sortSchema).extend({
  status: storeStatusSchema.optional(),
  appPlatformId: intIdSchema.optional(),
  isPlus: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export const storeIdParamSchema = z.object({
  id: uuidSchema,
});

export const storeCredentialsSchema = z.object({
  accessToken: z.string(),
  scopes: z.array(z.string()).optional(),
  multipassSecret: z.string().nullable().optional(),
});

// =============================================================================
// Response Schemas
// =============================================================================

export const storeResponseSchema = z.object({
  id: uuidSchema,
  appPlatformId: z.number().int(),
  platformStoreId: z.string(),
  domain: z.string(),
  name: z.string(),
  ownerEmail: z.string(),
  isPlus: z.boolean(),
  country: z.string().nullable(),
  status: storeStatusSchema,
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const storeListResponseSchema = z.object({
  data: z.array(storeResponseSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// =============================================================================
// Types
// =============================================================================

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
export type ListStoresQuery = z.infer<typeof listStoresQuerySchema>;
export type StoreResponse = z.infer<typeof storeResponseSchema>;
export type StoreCredentials = z.infer<typeof storeCredentialsSchema>;
