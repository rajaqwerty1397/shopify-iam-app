import { BaseSamlProvider, SamlConfig } from './base-saml.provider.js';
import { providerRegistry, ProviderConfig } from '../base.provider.js';

/**
 * OneLogin SAML Provider
 *
 * Implements SAML 2.0 authentication with OneLogin.
 *
 * @see https://developers.onelogin.com/saml
 */

export class OneLoginProvider extends BaseSamlProvider {
  readonly name = 'OneLogin';
  readonly providerType = 'onelogin';

  /**
   * OneLogin specific attribute mapping
   */
  protected getDefaultAttributeMapping(): Record<string, string> {
    return {
      email: 'User.email',
      firstName: 'User.FirstName',
      lastName: 'User.LastName',
      name: 'User.DisplayName',
      phone: 'User.phone',
      department: 'memberOf',
    };
  }

  /**
   * Get OneLogin icon URL
   */
  getIconUrl(): string {
    return '/icons/providers/onelogin.svg';
  }
}

// Register provider
providerRegistry.register('onelogin', OneLoginProvider);
