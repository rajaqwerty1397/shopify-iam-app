import { z } from 'zod';
import {
  uuidSchema,
  paginationSchema,
  sortSchema,
  ssoProviderStatusSchema,
  ssoProtocolSchema,
} from '../../common/schemas/index.js';

/**
 * SSO Providers Module Schemas
 */

// =============================================================================
// Request Schemas
// =============================================================================

export const createSsoProviderSchema = z.object({
  storeId: uuidSchema,
  providerType: z.string().min(1).max(50),
  protocol: ssoProtocolSchema,
  displayName: z.string().min(1).max(100),
  iconUrl: z.string().url().optional(),
  displayOrder: z.number().int().min(0).default(0),
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  buttonStyle: z
    .object({
      backgroundColor: z.string().optional(),
      textColor: z.string().optional(),
      borderColor: z.string().optional(),
      borderRadius: z.string().optional(),
    })
    .optional(),
  displayLocation: z
    .object({
      loginPage: z.boolean().default(true),
      registerPage: z.boolean().default(true),
      checkoutPage: z.boolean().default(false),
    })
    .optional(),
  config: z.record(z.unknown()), // Will be encrypted
  scopeMappings: z.record(z.string()).optional(),
  attributeMap: z.record(z.string()).optional(),
});

export const updateSsoProviderSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  iconUrl: z.string().url().nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  buttonStyle: z
    .object({
      backgroundColor: z.string().optional(),
      textColor: z.string().optional(),
      borderColor: z.string().optional(),
      borderRadius: z.string().optional(),
    })
    .optional(),
  displayLocation: z
    .object({
      loginPage: z.boolean().optional(),
      registerPage: z.boolean().optional(),
      checkoutPage: z.boolean().optional(),
    })
    .optional(),
  config: z.record(z.unknown()).optional(), // Will be encrypted
  scopeMappings: z.record(z.string()).optional(),
  attributeMap: z.record(z.string()).optional(),
  status: ssoProviderStatusSchema.optional(),
});

export const listSsoProvidersQuerySchema = paginationSchema.merge(sortSchema).extend({
  storeId: uuidSchema.optional(),
  protocol: ssoProtocolSchema.optional(),
  providerType: z.string().optional(),
  status: ssoProviderStatusSchema.optional(),
  isEnabled: z.coerce.boolean().optional(),
});

export const ssoProviderIdParamSchema = z.object({
  id: uuidSchema,
});

export const storeProviderParamSchema = z.object({
  storeId: uuidSchema,
  providerId: uuidSchema,
});

// =============================================================================
// Response Schemas
// =============================================================================

export const ssoProviderResponseSchema = z.object({
  id: uuidSchema,
  storeId: uuidSchema,
  providerType: z.string(),
  protocol: ssoProtocolSchema,
  displayName: z.string(),
  iconUrl: z.string().nullable(),
  displayOrder: z.number(),
  isEnabled: z.boolean(),
  isDefault: z.boolean(),
  buttonStyle: z.record(z.unknown()).nullable(),
  displayLocation: z.record(z.unknown()).nullable(),
  scopeMappings: z.record(z.unknown()).nullable(),
  attributeMap: z.record(z.unknown()).nullable(),
  status: ssoProviderStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ssoProviderPublicSchema = z.object({
  id: uuidSchema,
  providerType: z.string(),
  protocol: ssoProtocolSchema,
  displayName: z.string(),
  iconUrl: z.string().nullable(),
  displayOrder: z.number(),
  buttonStyle: z.record(z.unknown()).nullable(),
});

// =============================================================================
// Types
// =============================================================================

export type CreateSsoProviderInput = z.infer<typeof createSsoProviderSchema>;
export type UpdateSsoProviderInput = z.infer<typeof updateSsoProviderSchema>;
export type ListSsoProvidersQuery = z.infer<typeof listSsoProvidersQuerySchema>;
export type SsoProviderResponse = z.infer<typeof ssoProviderResponseSchema>;
export type SsoProviderPublic = z.infer<typeof ssoProviderPublicSchema>;
