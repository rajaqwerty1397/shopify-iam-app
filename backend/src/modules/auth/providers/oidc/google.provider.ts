import { BaseOidcProvider, OidcConfig } from './base-oidc.provider.js';
import { providerRegistry, ProviderConfig } from '../base.provider.js';

/**
 * Google OIDC Provider
 *
 * Implements Google Sign-In using OpenID Connect.
 *
 * @see https://developers.google.com/identity/openid-connect/openid-connect
 */

export interface GoogleConfig extends OidcConfig {
  hostedDomain?: string; // Restrict to specific Google Workspace domain
}

export class GoogleProvider extends BaseOidcProvider {
  readonly name = 'Google';
  readonly providerType = 'google';

  constructor(
    config: ProviderConfig,
    callbackUrl: string,
    storeId: string,
    providerId: string
  ) {
    // Set default issuer URL for Google
    const googleConfig: GoogleConfig = {
      ...config,
      issuerUrl: config.issuerUrl || 'https://accounts.google.com',
    } as GoogleConfig;

    super(googleConfig, callbackUrl, storeId, providerId);
  }

  /**
   * Default scopes for Google
   */
  getDefaultScopes(): string[] {
    return ['openid', 'email', 'profile'];
  }

  /**
   * Get Google icon URL
   */
  getIconUrl(): string {
    return '/icons/providers/google.svg';
  }

  /**
   * Google-specific required fields
   */
  getRequiredConfigFields(): string[] {
    return ['clientId', 'clientSecret'];
  }
}

// Register provider
providerRegistry.register('google', GoogleProvider);
