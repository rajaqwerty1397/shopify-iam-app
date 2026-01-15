import { BaseSamlProvider, SamlConfig } from './base-saml.provider.js';
import { providerRegistry, ProviderConfig } from '../base.provider.js';

/**
 * Okta SAML Provider
 *
 * Implements SAML 2.0 authentication with Okta.
 *
 * @see https://developer.okta.com/docs/guides/build-sso-integration/saml2/main/
 */

export class OktaProvider extends BaseSamlProvider {
  readonly name = 'Okta';
  readonly providerType = 'okta';

  /**
   * Okta-specific attribute mapping
   */
  protected getDefaultAttributeMapping(): Record<string, string> {
    return {
      email: 'email',
      firstName: 'firstName',
      lastName: 'lastName',
      name: 'displayName',
      groups: 'groups',
    };
  }

  /**
   * Get Okta icon URL
   */
  getIconUrl(): string {
    return '/icons/providers/okta.svg';
  }
}

// Register provider
providerRegistry.register('okta', OktaProvider);
