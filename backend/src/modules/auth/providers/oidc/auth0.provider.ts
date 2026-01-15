import { BaseOidcProvider, OidcConfig } from './base-oidc.provider.js';
import { providerRegistry, ProviderConfig } from '../base.provider.js';

/**
 * Auth0 Provider
 *
 * Implements OIDC authentication with Auth0.
 * Also serves as a generic OIDC provider for custom OAuth implementations.
 */

export interface Auth0Config extends OidcConfig {
  domain?: string; // Auth0 specific - alternative to issuerUrl
}

export class Auth0Provider extends BaseOidcProvider {
  readonly name = 'Auth0';
  readonly providerType = 'auth0';

  constructor(
    config: ProviderConfig,
    callbackUrl: string,
    storeId: string,
    providerId: string
  ) {
    // If domain is provided, convert to issuerUrl
    const auth0Config = config as Auth0Config;
    if (auth0Config.domain && !auth0Config.issuerUrl) {
      auth0Config.issuerUrl = `https://${auth0Config.domain}/`;
    }
    super(auth0Config, callbackUrl, storeId, providerId);
  }

  getDefaultScopes(): string[] {
    return ['openid', 'profile', 'email'];
  }

  validateConfig(): boolean {
    const config = this.config as Auth0Config;
    // Either issuerUrl or domain is required
    const hasIssuer = !!(config.issuerUrl || config.domain);
    return !!(config.clientId && config.clientSecret && hasIssuer);
  }

  getRequiredConfigFields(): string[] {
    return ['clientId', 'clientSecret', 'issuerUrl']; // or domain
  }
}

/**
 * Custom/Generic OIDC Provider
 *
 * For any OIDC-compliant provider that isn't specifically supported.
 */
export class CustomOidcProvider extends BaseOidcProvider {
  readonly name = 'Custom OIDC';
  readonly providerType = 'custom';

  getDefaultScopes(): string[] {
    return ['openid', 'profile', 'email'];
  }
}

// Register providers
providerRegistry.register('auth0', Auth0Provider);
providerRegistry.register('custom', CustomOidcProvider);
providerRegistry.register('custom_oauth', CustomOidcProvider);
