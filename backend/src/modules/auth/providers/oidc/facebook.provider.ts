import { Issuer, Client, generators } from 'openid-client';
import {
  BaseSsoProvider,
  ProviderConfig,
  AuthInitiateResult,
  AuthCallbackParams,
  AuthResult,
  UserProfile,
  providerRegistry,
} from '../base.provider.js';
import { ssoState } from '../../../../lib/redis.js';
import { createModuleLogger } from '../../../../lib/logger.js';
import { InvalidOidcTokenError, ProviderAuthError } from '../../../../common/errors/index.js';
import { SsoProtocol } from '../../../../common/schemas/index.js';

const logger = createModuleLogger('FacebookProvider');

/**
 * Facebook OIDC Provider
 *
 * Implements Facebook Login using their limited OIDC implementation.
 * Facebook doesn't fully support OIDC discovery, so we configure manually.
 *
 * @see https://developers.facebook.com/docs/facebook-login/limited-login/
 */

export interface FacebookConfig extends ProviderConfig {
  clientId: string;
  clientSecret: string;
  apiVersion?: string;
}

export class FacebookProvider extends BaseSsoProvider {
  readonly name = 'Facebook';
  readonly protocol: SsoProtocol = 'oidc';
  readonly providerType = 'facebook';

  private client: Client | null = null;
  private apiVersion: string;

  constructor(
    config: ProviderConfig,
    callbackUrl: string,
    storeId: string,
    providerId: string
  ) {
    super(config, callbackUrl, storeId, providerId);
    this.apiVersion = (config as FacebookConfig).apiVersion || 'v18.0';
  }

  /**
   * Get the Facebook OAuth client
   */
  private async getClient(): Promise<Client> {
    if (this.client) return this.client;

    const config = this.config as FacebookConfig;

    // Facebook doesn't support OIDC discovery, so we create issuer manually
    const issuer = new Issuer({
      issuer: 'https://www.facebook.com',
      authorization_endpoint: `https://www.facebook.com/${this.apiVersion}/dialog/oauth`,
      token_endpoint: `https://graph.facebook.com/${this.apiVersion}/oauth/access_token`,
      userinfo_endpoint: `https://graph.facebook.com/${this.apiVersion}/me`,
    });

    this.client = new issuer.Client({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uris: [this.buildCallbackUrl()],
      response_types: ['code'],
    });

    return this.client;
  }

  /**
   * Initialize Facebook OAuth flow
   */
  async initiate(returnTo?: string): Promise<AuthInitiateResult> {
    const client = await this.getClient();

    const state = generators.state();

    // Store state in Redis
    await ssoState.set(state, {
      storeId: this.storeId,
      providerId: this.providerId,
      returnTo,
      createdAt: Date.now(),
    });

    const redirectUrl = client.authorizationUrl({
      scope: this.getDefaultScopes().join(','),
      state,
    });

    return { redirectUrl, state };
  }

  /**
   * Handle Facebook OAuth callback
   */
  async handleCallback(params: AuthCallbackParams): Promise<AuthResult> {
    const { code, state, error, errorDescription } = params;

    if (error) {
      logger.warn({ error, errorDescription }, 'Facebook callback error');
      throw new ProviderAuthError(errorDescription || error);
    }

    if (!code || !state) {
      throw new InvalidOidcTokenError('Missing code or state in callback');
    }

    // Validate state
    const stateData = await ssoState.consume(state);
    if (!stateData) {
      throw new InvalidOidcTokenError('Invalid or expired state');
    }

    if (stateData.storeId !== this.storeId || stateData.providerId !== this.providerId) {
      throw new InvalidOidcTokenError('State mismatch');
    }

    const client = await this.getClient();

    try {
      // Exchange code for token
      const tokenSet = await client.callback(this.buildCallbackUrl(), { code, state }, { state });

      // Get user profile from Facebook Graph API
      const config = this.config as FacebookConfig;
      const fields = 'id,email,first_name,last_name,name,picture';
      const userInfoUrl = `https://graph.facebook.com/${this.apiVersion}/me?fields=${fields}&access_token=${tokenSet.access_token}`;

      const response = await fetch(userInfoUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      const fbUser = await response.json() as {
        id: string;
        email?: string;
        first_name?: string;
        last_name?: string;
        name?: string;
        picture?: { data?: { url?: string } };
      };

      const user: UserProfile = {
        id: fbUser.id,
        email: fbUser.email || '',
        firstName: fbUser.first_name,
        lastName: fbUser.last_name,
        name: fbUser.name,
        picture: fbUser.picture?.data?.url,
        rawProfile: fbUser as Record<string, unknown>,
      };

      return {
        user,
        tokens: {
          accessToken: tokenSet.access_token!,
          expiresIn: tokenSet.expires_in,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Facebook callback failed');
      throw new ProviderAuthError('Authentication failed');
    }
  }

  /**
   * Default scopes for Facebook
   */
  getDefaultScopes(): string[] {
    return ['email', 'public_profile'];
  }

  /**
   * Validate configuration
   */
  validateConfig(): boolean {
    const config = this.config as FacebookConfig;
    return !!(config.clientId && config.clientSecret);
  }

  /**
   * Required fields
   */
  getRequiredConfigFields(): string[] {
    return ['clientId', 'clientSecret'];
  }

  /**
   * Facebook icon
   */
  getIconUrl(): string {
    return '/icons/providers/facebook.svg';
  }
}

// Register provider
providerRegistry.register('facebook', FacebookProvider);
