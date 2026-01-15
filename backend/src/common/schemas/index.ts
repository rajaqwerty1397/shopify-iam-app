import { z } from 'zod';

/**
 * Common Zod schemas for validation across the application
 */

// =============================================================================
// Base Schemas
// =============================================================================

export const uuidSchema = z.string().uuid();
export const intIdSchema = z.coerce.number().int().positive();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// =============================================================================
// Common Response Schemas
// =============================================================================

export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export const successResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  });

// =============================================================================
// Parameter Schemas
// =============================================================================

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const storeIdParamSchema = z.object({
  storeId: uuidSchema,
});

export const providerIdParamSchema = z.object({
  providerId: uuidSchema,
});

// =============================================================================
// Query Schemas
// =============================================================================

export const listQuerySchema = paginationSchema.merge(sortSchema);

export const searchQuerySchema = listQuerySchema.extend({
  q: z.string().optional(),
});

// =============================================================================
// Status Enums
// =============================================================================

export const platformStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const applicationStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const appPlatformStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const storeStatusSchema = z.enum(['active', 'paused', 'uninstalled', 'suspended']);
export const subscriptionStatusSchema = z.enum(['trialing', 'active', 'past_due', 'canceled', 'expired']);
export const billingCycleSchema = z.enum(['monthly', 'annual']);
export const ssoProviderStatusSchema = z.enum(['active', 'disabled', 'pending_setup']);
export const ssoProtocolSchema = z.enum(['oidc', 'saml']);
export const ssoUserStatusSchema = z.enum(['active', 'blocked', 'pending']);
export const loginEventTypeSchema = z.enum([
  'login_initiated',
  'login_success',
  'login_failed',
  'logout',
  'token_refresh',
]);

// =============================================================================
// Types
// =============================================================================

export type PaginationInput = z.infer<typeof paginationSchema>;
export type SortInput = z.infer<typeof sortSchema>;
export type ListQueryInput = z.infer<typeof listQuerySchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

export type PlatformStatus = z.infer<typeof platformStatusSchema>;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
export type AppPlatformStatus = z.infer<typeof appPlatformStatusSchema>;
export type StoreStatus = z.infer<typeof storeStatusSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type BillingCycle = z.infer<typeof billingCycleSchema>;
export type SsoProviderStatus = z.infer<typeof ssoProviderStatusSchema>;
export type SsoProtocol = z.infer<typeof ssoProtocolSchema>;
export type SsoUserStatus = z.infer<typeof ssoUserStatusSchema>;
export type LoginEventType = z.infer<typeof loginEventTypeSchema>;
