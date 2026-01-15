import { Issuer, Client, generators, TokenSet } from 'openid-client';
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
import { InvalidOidcTokenError, ProviderAuthError } from '../../../../common/errors/index.js';
import { SsoProtocol } from '../../../../common/schemas/index.js';

const logger = createModuleLogger('OidcProvider');

/**
 * Base OIDC Provider
 *
 * Implements common OIDC functionality that all OIDC providers share.
 * Specific providers (Google, Microsoft, etc.) extend this class.
 */

export interface OidcConfig extends ProviderConfig {
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
  scopes?: string[];
}

export abstract class BaseOidcProvider extends BaseSsoProvider {
  readonly protocol: SsoProtocol = 'oidc';
  protected client: Client | null = null;
  protected issuer: Issuer | null = null;

  /**
   * Get the OIDC client, initializing if needed
   * Note: We rebuild the client each time to ensure it uses the current callback URL
   * This prevents issues when the callback URL changes (e.g., Cloudflare tunnel restarts)
   */
  protected async getClient(): Promise<Client> {
    const config = this.config as OidcConfig;
    const currentCallbackUrl = this.buildCallbackUrl();

    try {
      // Always rebuild client to ensure callback URL is current
      // Discover issuer configuration (cached by openid-client library)
      if (!this.issuer) {
        this.issuer = await Issuer.discover(config.issuerUrl);
      }

      // Create client with current callback URL
      this.client = new this.issuer.Client({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uris: [currentCallbackUrl],
        response_types: ['code'],
      });

      logger.debug({ 
        callbackUrl: currentCallbackUrl,
        provider: this.providerType 
      }, 'OIDC client created with callback URL');

      return this.client;
    } catch (error) {
      logger.error({ error, provider: this.providerType }, 'Failed to initialize OIDC client');
      throw new ProviderAuthError('Failed to initialize OIDC provider');
    }
  }

  /**
   * Initialize the OIDC authentication flow
   */
  async initiate(returnTo?: string): Promise<AuthInitiateResult> {
    const client = await this.getClient();

    // Generate state and nonce for security
    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    // Store state data in Redis
    await ssoState.set(state, {
      storeId: this.storeId,
      providerId: this.providerId,
      nonce,
      codeVerifier,
      returnTo,
      createdAt: Date.now(),
    });

    // Build authorization URL with explicit redirect_uri
    const scopes = (this.config as OidcConfig).scopes || this.getDefaultScopes();
    const callbackUrl = this.buildCallbackUrl();
    
    // Ensure callback URL is normalized (no trailing slash, proper encoding)
    const normalizedCallbackUrl = callbackUrl.replace(/\/$/, '');
    
    // Log the exact callback URL being used - this MUST match what's in OAuth provider settings
    logger.info({ 
      provider: this.providerType,
      callbackUrl_built: callbackUrl,
      callbackUrl_normalized: normalizedCallbackUrl,
      callbackUrl_base: this.callbackUrl,
      OAUTH_CALLBACK_URL_env: process.env.OAUTH_CALLBACK_URL || '(not set)',
      SHOPIFY_APP_URL_env: process.env.SHOPIFY_APP_URL || '(not set)',
      scopes,
      warning: 'IMPORTANT: This exact callback URL must be added to your OAuth provider settings (Google Cloud Console, Auth0, etc.)'
    }, 'Building OAuth authorization URL - CALLBACK URL DETAILS');
    
    // Build authorization URL - the redirect_uri parameter must exactly match what's configured in OAuth provider
    const redirectUrl = client.authorizationUrl({
      scope: scopes.join(' '),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: normalizedCallbackUrl, // This must match exactly what's in Google Cloud Console
    });
    
    // Log the final authorization URL (without sensitive params) to verify redirect_uri
    logger.info({
      provider: this.providerType,
      authorizationUrl_base: redirectUrl.split('?')[0],
      redirect_uri_in_url: new URL(redirectUrl).searchParams.get('redirect_uri'),
      expected_callback_url: normalizedCallbackUrl,
    }, 'OAuth authorization URL built - VERIFY redirect_uri matches');
    
    // Log the full authorization URL for debugging (without sensitive params)
    logger.debug({ 
      authorizationUrl: redirectUrl.split('?')[0], // URL without query params
      redirectUri: normalizedCallbackUrl,
      provider: this.providerType
    }, 'OAuth authorization URL built - redirect_uri parameter is set');

    return { redirectUrl, state, nonce };
  }

  /**
   * Handle the OIDC callback
   * @param params - Callback parameters
   * @param providedStateData - Optional state data (if already consumed by route handler)
   */
  async handleCallback(params: AuthCallbackParams, providedStateData?: Record<string, unknown>): Promise<AuthResult> {
    const { code, state, error, errorDescription } = params;

    // Check for error from provider
    if (error) {
      logger.warn({ error, errorDescription, provider: this.providerType }, 'OIDC callback error');
      throw new ProviderAuthError(errorDescription || error);
    }

    if (!code || !state) {
      throw new InvalidOidcTokenError('Missing code or state in callback');
    }

    // Use provided state data if available (already consumed by route handler)
    // Otherwise, consume it here (for backwards compatibility)
    let stateData: Record<string, unknown>;
    if (providedStateData) {
      stateData = providedStateData;
    } else {
      // Fallback: consume state if not provided (for backwards compatibility)
      const consumed = await ssoState.consume(state);
      if (!consumed) {
        throw new InvalidOidcTokenError('Invalid or expired state');
      }
      stateData = consumed;
    }

    if (stateData.storeId !== this.storeId || stateData.providerId !== this.providerId) {
      throw new InvalidOidcTokenError('State mismatch');
    }

    const client = await this.getClient();

    try {
      // Exchange code for tokens
      const tokenSet = await client.callback(this.buildCallbackUrl(), { code, state }, {
        state,
        nonce: stateData.nonce as string,
        code_verifier: stateData.codeVerifier as string,
      });

      // Get user profile
      const user = await this.extractUserProfile(tokenSet, client);

      return {
        user,
        tokens: {
          accessToken: tokenSet.access_token!,
          refreshToken: tokenSet.refresh_token,
          idToken: tokenSet.id_token,
          expiresIn: tokenSet.expires_in,
        },
      };
    } catch (error) {
      logger.error({ error, provider: this.providerType }, 'OIDC callback failed');
      throw new ProviderAuthError('Authentication failed');
    }
  }

  /**
   * Extract user profile from token set
   * Can be overridden by specific providers for custom claim mapping
   */
  protected async extractUserProfile(
    tokenSet: TokenSet,
    client: Client
  ): Promise<UserProfile> {
    // Get claims from ID token or userinfo endpoint
    let claims = tokenSet.claims();

    // If no claims in ID token, fetch from userinfo
    if (!claims.email && tokenSet.access_token) {
      const userinfo = await client.userinfo(tokenSet.access_token);
      claims = { ...claims, ...userinfo };
    }

    return {
      id: claims.sub,
      email: claims.email as string,
      firstName: claims.given_name as string | undefined,
      lastName: claims.family_name as string | undefined,
      name: claims.name as string | undefined,
      picture: claims.picture as string | undefined,
      emailVerified: claims.email_verified as boolean | undefined,
      locale: claims.locale as string | undefined,
      rawProfile: claims as Record<string, unknown>,
    };
  }

  /**
   * Validate provider configuration
   */
  validateConfig(): boolean {
    const config = this.config as OidcConfig;
    return !!(config.clientId && config.clientSecret && config.issuerUrl);
  }

  /**
   * Get required configuration fields
   */
  getRequiredConfigFields(): string[] {
    return ['clientId', 'clientSecret', 'issuerUrl'];
  }
}
