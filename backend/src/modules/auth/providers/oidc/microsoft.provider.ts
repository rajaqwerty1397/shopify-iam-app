import { BaseOidcProvider, OidcConfig } from './base-oidc.provider.js';
import { providerRegistry, ProviderConfig } from '../base.provider.js';

/**
 * Microsoft OIDC Provider
 *
 * Implements Microsoft Entra ID (Azure AD) Sign-In using OpenID Connect.
 * Supports both personal Microsoft accounts and organizational accounts.
 *
 * @see https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
 */

export interface MicrosoftConfig extends OidcConfig {
  tenantId?: string; // 'common', 'organizations', 'consumers', or specific tenant ID
}

export class MicrosoftProvider extends BaseOidcProvider {
  readonly name = 'Microsoft';
  readonly providerType = 'microsoft';

  constructor(
    config: ProviderConfig,
    callbackUrl: string,
    storeId: string,
    providerId: string
  ) {
    const msConfig = config as MicrosoftConfig;
    const tenantId = msConfig.tenantId || 'common';

    // Set default issuer URL for Microsoft
    const microsoftConfig: MicrosoftConfig = {
      ...config,
      issuerUrl: config.issuerUrl || `https://login.microsoftonline.com/${tenantId}/v2.0`,
      tenantId,
    } as MicrosoftConfig;

    super(microsoftConfig, callbackUrl, storeId, providerId);
  }

  /**
   * Default scopes for Microsoft
   */
  getDefaultScopes(): string[] {
    return ['openid', 'email', 'profile', 'User.Read'];
  }

  /**
   * Get Microsoft icon URL
   */
  getIconUrl(): string {
    return '/icons/providers/microsoft.svg';
  }

  /**
   * Microsoft-specific required fields
   */
  getRequiredConfigFields(): string[] {
    return ['clientId', 'clientSecret'];
  }
}

// Register provider
providerRegistry.register('microsoft', MicrosoftProvider);
