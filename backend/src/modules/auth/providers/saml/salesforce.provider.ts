import { BaseSamlProvider, SamlConfig } from './base-saml.provider.js';
import { providerRegistry, ProviderConfig } from '../base.provider.js';

/**
 * Salesforce SAML Provider
 *
 * Implements SAML 2.0 authentication with Salesforce.
 *
 * @see https://help.salesforce.com/s/articleView?id=sf.sso_saml.htm
 */

export class SalesforceProvider extends BaseSamlProvider {
  readonly name = 'Salesforce';
  readonly providerType = 'salesforce';

  /**
   * Salesforce specific attribute mapping
   */
  protected getDefaultAttributeMapping(): Record<string, string> {
    return {
      email: 'email',
      firstName: 'first_name',
      lastName: 'last_name',
      name: 'username',
      userId: 'user_id',
      orgId: 'organization_id',
      profileId: 'profile_id',
    };
  }

  /**
   * Get Salesforce icon URL
   */
  getIconUrl(): string {
    return '/icons/providers/salesforce.svg';
  }
}

// Register provider
providerRegistry.register('salesforce', SalesforceProvider);
