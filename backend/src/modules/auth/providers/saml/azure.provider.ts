import { BaseSamlProvider, SamlConfig } from './base-saml.provider.js';
import { providerRegistry, ProviderConfig } from '../base.provider.js';

/**
 * Azure AD SAML Provider
 *
 * Implements SAML 2.0 authentication with Microsoft Entra ID (Azure AD).
 *
 * @see https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-saml-token-attributes
 */

export class AzureAdProvider extends BaseSamlProvider {
  readonly name = 'Azure AD';
  readonly providerType = 'azure';

  /**
   * Azure AD specific attribute mapping using standard claim URIs
   */
  protected getDefaultAttributeMapping(): Record<string, string> {
    return {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      name: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
      upn: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn',
      groups: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
      roles: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
    };
  }

  /**
   * Get Azure icon URL
   */
  getIconUrl(): string {
    return '/icons/providers/azure.svg';
  }
}

// Register provider
providerRegistry.register('azure', AzureAdProvider);
