import { SAML, SamlConfig as PassportSamlConfig } from '@node-saml/passport-saml';
import {
  BaseSsoProvider,
  ProviderConfig,
  AuthInitiateResult,
  AuthCallbackParams,
  AuthResult,
  UserProfile,
} from '../base.provider.js';
import { ssoState } from '../../../../lib/redis.js';
import { createModuleLogger } from '../../../../lib/logger.js';
import { InvalidSamlResponseError, ProviderAuthError } from '../../../../common/errors/index.js';
import { SsoProtocol } from '../../../../common/schemas/index.js';
import { generateRandomString } from '../../../../common/utils/index.js';

const logger = createModuleLogger('SamlProvider');

/**
 * Base SAML Provider
 *
 * Implements common SAML 2.0 SP functionality.
 * Specific SAML providers (Okta, Azure AD, etc.) extend this class.
 */

export interface SamlConfig extends ProviderConfig {
  entryPoint: string; // IdP SSO URL
  issuer: string; // SP Entity ID
  cert: string; // IdP certificate (PEM format)
  privateKey?: string; // SP private key for signing
  signatureAlgorithm?: 'sha256' | 'sha512';
  wantAssertionsSigned?: boolean;
  wantAuthnResponseSigned?: boolean;
  attributeMapping?: Record<string, string>;
}

export interface SamlProfile {
  nameID?: string;
  nameIDFormat?: string;
  nameQualifier?: string;
  spNameQualifier?: string;
  sessionIndex?: string;
  [key: string]: unknown;
}

export abstract class BaseSamlProvider extends BaseSsoProvider {
  readonly protocol: SsoProtocol = 'saml';
  protected saml: SAML | null = null;

  /**
   * Get SAML client, initializing if needed
   */
  protected getSamlClient(): SAML {
    if (this.saml) return this.saml;

    const config = this.config as SamlConfig;

    const samlConfig: PassportSamlConfig = {
      callbackUrl: this.buildCallbackUrl(),
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      cert: config.cert,
      privateKey: config.privateKey,
      signatureAlgorithm: config.signatureAlgorithm || 'sha256',
      wantAssertionsSigned: config.wantAssertionsSigned ?? true,
      wantAuthnResponseSigned: config.wantAuthnResponseSigned ?? true,
      validateInResponseTo: 'always',
      requestIdExpirationPeriodMs: 300000, // 5 minutes
    };

    this.saml = new SAML(samlConfig);
    return this.saml;
  }

  /**
   * Initialize SAML authentication flow
   */
  async initiate(returnTo?: string): Promise<AuthInitiateResult> {
    const saml = this.getSamlClient();

    // Generate unique request ID
    const requestId = `_${generateRandomString(32)}`;

    // Store state in Redis
    const state = generateRandomString(32);
    await ssoState.set(state, {
      storeId: this.storeId,
      providerId: this.providerId,
      requestId,
      returnTo,
      createdAt: Date.now(),
    });

    // Also store the request ID for InResponseTo validation
    await ssoState.setInResponseTo(requestId, this.storeId);

    try {
      // Generate SAML AuthnRequest
      const authnRequestUrl = await saml.getAuthorizeUrlAsync(
        state, // RelayState
        { additionalParams: {} }
      );

      return {
        redirectUrl: authnRequestUrl,
        state,
      };
    } catch (error) {
      logger.error({ error, provider: this.providerType }, 'Failed to generate SAML request');
      throw new ProviderAuthError('Failed to initiate SAML authentication');
    }
  }

  /**
   * Handle SAML callback (POST from IdP)
   */
  async handleCallback(params: AuthCallbackParams): Promise<AuthResult> {
    const { samlResponse, relayState, error, errorDescription } = params;

    if (error) {
      logger.warn({ error, errorDescription }, 'SAML callback error');
      throw new ProviderAuthError(errorDescription || error);
    }

    if (!samlResponse) {
      throw new InvalidSamlResponseError('Missing SAML response');
    }

    // Validate RelayState
    const stateData = relayState ? await ssoState.consume(relayState) : null;
    if (!stateData) {
      throw new InvalidSamlResponseError('Invalid or expired state');
    }

    if (stateData.storeId !== this.storeId || stateData.providerId !== this.providerId) {
      throw new InvalidSamlResponseError('State mismatch');
    }

    const saml = this.getSamlClient();

    try {
      // Validate and parse SAML response
      const result = await saml.validatePostResponseAsync({
        SAMLResponse: samlResponse,
      });

      const profile = result.profile as SamlProfile;

      // Extract user profile using attribute mapping
      const user = this.extractUserProfile(profile);

      return { user };
    } catch (error) {
      logger.error({ error, provider: this.providerType }, 'SAML validation failed');

      if (error instanceof Error) {
        if (error.message.includes('InResponseTo')) {
          throw new InvalidSamlResponseError('SAML response replay detected');
        }
        if (error.message.includes('expired')) {
          throw new InvalidSamlResponseError('SAML response expired');
        }
        if (error.message.includes('signature')) {
          throw new InvalidSamlResponseError('Invalid SAML signature');
        }
      }

      throw new InvalidSamlResponseError('SAML authentication failed');
    }
  }

  /**
   * Extract user profile from SAML assertion
   * Override in specific providers for custom attribute mapping
   */
  protected extractUserProfile(profile: SamlProfile): UserProfile {
    const config = this.config as SamlConfig;
    const mapping = config.attributeMapping || this.getDefaultAttributeMapping();

    // Helper to get attribute value
    const getAttribute = (key: string): string | undefined => {
      const mappedKey = mapping[key] || key;
      const value = profile[mappedKey];
      return typeof value === 'string' ? value : undefined;
    };

    return {
      id: profile.nameID || getAttribute('id') || '',
      email: getAttribute('email') || profile.nameID || '',
      firstName: getAttribute('firstName'),
      lastName: getAttribute('lastName'),
      name: getAttribute('name'),
      rawProfile: profile as Record<string, unknown>,
    };
  }

  /**
   * Get default attribute mapping for SAML assertions
   * Override in specific providers
   */
  protected getDefaultAttributeMapping(): Record<string, string> {
    return {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      name: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    };
  }

  /**
   * Generate SP metadata XML
   */
  async generateMetadata(): Promise<string> {
    const saml = this.getSamlClient();
    return saml.generateServiceProviderMetadata(null, null);
  }

  /**
   * Validate configuration
   */
  validateConfig(): boolean {
    const config = this.config as SamlConfig;
    return !!(config.entryPoint && config.issuer && config.cert);
  }

  /**
   * Required fields for SAML
   */
  getRequiredConfigFields(): string[] {
    return ['entryPoint', 'issuer', 'cert'];
  }

  /**
   * SAML doesn't use scopes
   */
  getDefaultScopes(): string[] {
    return [];
  }
}
