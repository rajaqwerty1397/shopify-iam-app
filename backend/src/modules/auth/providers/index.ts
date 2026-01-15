// Export base provider and registry
export * from './base.provider.js';

// Export OIDC providers
export * from './oidc/index.js';

// Export SAML providers
export * from './saml/index.js';

/**
 * Provider Factory
 *
 * Creates the appropriate provider instance based on configuration.
 * This is the main entry point for getting provider instances.
 */

import { providerRegistry, BaseSsoProvider, ProviderConfig } from './base.provider.js';
import { encryptionService } from '../../../services/encryption.service.js';
import { config } from '../../../config/index.js';

export interface CreateProviderOptions {
  providerType: string;
  config: string | ProviderConfig; // Encrypted string or plain config
  storeId: string;
  providerId: string;
}

import { createModuleLogger } from '../../../lib/logger.js';
const logger = createModuleLogger('ProviderFactory');

/**
 * Create a provider instance from database configuration
 */
export function createProvider(options: CreateProviderOptions): BaseSsoProvider {
  const { providerType, config: providerConfig, storeId, providerId } = options;

  // Decrypt config if it's a string
  const decryptedConfig =
    typeof providerConfig === 'string'
      ? encryptionService.decrypt<ProviderConfig>(providerConfig)
      : providerConfig;

  // Build callback URL - ALWAYS read directly from env to avoid cached config issues
  // Use OAUTH_CALLBACK_URL (Cloudflare tunnel to backend)
  // This is separate from SHOPIFY_APP_URL (ngrok to frontend) when using dual tunnels
  const callbackBaseUrlFromEnv = process.env.OAUTH_CALLBACK_URL || process.env.SHOPIFY_APP_URL || config.oauth.callbackBaseUrl;
  const callbackUrl = `${callbackBaseUrlFromEnv}/api/auth`;
  
  // Calculate exact callback URL that will be used
  const protocol = providerType === 'facebook' ? 'oidc' : 'oidc'; // All OIDC for now
  const exactCallbackUrl = `${callbackUrl}/${protocol}/${providerType}/callback`.replace(/([^:]\/)\/+/g, '$1');
  
  logger.info({
    providerType,
    OAUTH_CALLBACK_URL_env: process.env.OAUTH_CALLBACK_URL || '(not set)',
    SHOPIFY_APP_URL_env: process.env.SHOPIFY_APP_URL || '(not set)',
    callbackBaseUrl_fromConfig: config.oauth.callbackBaseUrl,
    callbackBaseUrl_used: callbackBaseUrlFromEnv,
    callbackUrl,
    exactCallbackUrl,
    storeId,
    providerId,
    warning: 'This exact callback URL will be sent to OAuth provider - MUST match provider settings',
  }, '=== CREATING PROVIDER - OAuth Callback URL Info ===');

  return providerRegistry.create(
    providerType,
    decryptedConfig,
    callbackUrl,
    storeId,
    providerId
  );
}

/**
 * Get list of all supported providers
 */
export function getSupportedProviders(): Array<{
  type: string;
  protocol: 'oidc' | 'saml';
  name: string;
}> {
  return [
    // OIDC Providers
    { type: 'google', protocol: 'oidc', name: 'Google' },
    { type: 'microsoft', protocol: 'oidc', name: 'Microsoft' },
    { type: 'facebook', protocol: 'oidc', name: 'Facebook' },
    { type: 'auth0', protocol: 'oidc', name: 'Auth0' },
    { type: 'custom', protocol: 'oidc', name: 'Custom OIDC' },
    { type: 'custom_oauth', protocol: 'oidc', name: 'Custom OAuth' },
    // SAML Providers
    { type: 'okta', protocol: 'saml', name: 'Okta' },
    { type: 'azure', protocol: 'saml', name: 'Azure AD' },
    { type: 'onelogin', protocol: 'saml', name: 'OneLogin' },
    { type: 'salesforce', protocol: 'saml', name: 'Salesforce' },
  ];
}

/**
 * Check if a provider type is supported
 */
export function isProviderSupported(providerType: string): boolean {
  return providerRegistry.has(providerType);
}
