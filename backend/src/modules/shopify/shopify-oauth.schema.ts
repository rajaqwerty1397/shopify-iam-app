import { z } from 'zod';

/**
 * Shopify OAuth Module Schemas
 */

// =============================================================================
// Request Schemas
// =============================================================================

export const shopifyAuthQuerySchema = z.object({
  shop: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/, 'Invalid shop domain'),
});

export const shopifyCallbackQuerySchema = z.object({
  shop: z.string(),
  code: z.string(),
  state: z.string().optional(),
  hmac: z.string(),
  timestamp: z.string(),
  host: z.string().optional(),
});

export const shopifyWebhookHeadersSchema = z.object({
  'x-shopify-topic': z.string(),
  'x-shopify-shop-domain': z.string(),
  'x-shopify-hmac-sha256': z.string(),
  'x-shopify-api-version': z.string().optional(),
});

// =============================================================================
// Response Types
// =============================================================================

export interface ShopifyShopInfo {
  id: number;
  name: string;
  email: string;
  domain: string;
  myshopify_domain: string;
  country_code: string;
  country_name: string;
  currency: string;
  timezone: string;
  plan_name: string;
  plan_display_name: string;
  has_storefront: boolean;
  eligible_for_payments: boolean;
}

export interface ShopifyOAuthTokenResponse {
  access_token: string;
  scope: string;
}

export interface StoreInstallationResult {
  storeId: string;
  domain: string;
  name: string;
  isPlus: boolean;
  planId: number;
  subscriptionId: number;
  redirectUrl: string;
}

// =============================================================================
// Types
// =============================================================================

export type ShopifyAuthQuery = z.infer<typeof shopifyAuthQuerySchema>;
export type ShopifyCallbackQuery = z.infer<typeof shopifyCallbackQuerySchema>;
