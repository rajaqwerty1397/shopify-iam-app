import { SsoProtocol } from '../../../common/schemas/index.js';

/**
 * Base Provider Interface
 *
 * All SSO providers (OIDC and SAML) must implement this interface.
 * This ensures extensibility - new providers can be added without
 * modifying existing code (Open/Closed Principle).
 */

// =============================================================================
// Types
// =============================================================================

export interface ProviderConfig {
  clientId?: string;
  clientSecret?: string;
  issuerUrl?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  // SAML-specific
  entryPoint?: string;
  cert?: string;
  issuer?: string;
  // Common
  scopes?: string[];
  [key: string]: unknown;
}

export interface AuthInitiateResult {
  redirectUrl: string;
  state: string;
  nonce?: string;
}

export interface AuthCallbackParams {
  code?: string;
  state?: string;
  samlResponse?: string;
  relayState?: string;
  error?: string;
  errorDescription?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
  locale?: string;
  rawProfile: Record<string, unknown>;
}

export interface AuthResult {
  user: UserProfile;
  tokens?: {
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresIn?: number;
  };
}

// =============================================================================
// Base Provider Abstract Class
// =============================================================================

export abstract class BaseSsoProvider {
  abstract readonly name: string;
  abstract readonly protocol: SsoProtocol;
  abstract readonly providerType: string;

  protected config: ProviderConfig;
  protected callbackUrl: string;
  protected storeId: string;
  protected providerId: string;

  constructor(
    config: ProviderConfig,
    callbackUrl: string,
    storeId: string,
    providerId: string
  ) {
    this.config = config;
    this.callbackUrl = callbackUrl;
    this.storeId = storeId;
    this.providerId = providerId;
  }

  /**
   * Initialize the authentication flow
   * Returns a URL to redirect the user to
   */
  abstract initiate(returnTo?: string): Promise<AuthInitiateResult>;

  /**
   * Handle the callback from the identity provider
   * Returns the authenticated user profile
   */
  abstract handleCallback(params: AuthCallbackParams): Promise<AuthResult>;

  /**
   * Validate the provider configuration
   */
  abstract validateConfig(): boolean;

  /**
   * Get the required configuration fields for this provider
   */
  abstract getRequiredConfigFields(): string[];

  /**
   * Get default scopes/claims for this provider
   */
  abstract getDefaultScopes(): string[];

  /**
   * Get the provider icon URL
   */
  getIconUrl(): string {
    return `/icons/providers/${this.providerType}.svg`;
  }

  /**
   * Get the display name for this provider
   */
  getDisplayName(): string {
    return this.name;
  }

  /**
   * Build the callback URL for this provider
   * Ensures no double slashes and proper formatting
   */
  protected buildCallbackUrl(): string {
    const baseUrl = this.callbackUrl.replace(/\/$/, ''); // Remove trailing slash
    const providerPath = `${this.protocol}/${this.providerType}/callback`;
    return `${baseUrl}/${providerPath}`.replace(/([^:]\/)\/+/g, '$1'); // Remove double slashes
  }
}

// =============================================================================
// Provider Registry
// =============================================================================

type ProviderConstructor = new (
  config: ProviderConfig,
  callbackUrl: string,
  storeId: string,
  providerId: string
) => BaseSsoProvider;

class ProviderRegistry {
  private providers = new Map<string, ProviderConstructor>();

  /**
   * Register a new provider type
   */
  register(providerType: string, constructor: ProviderConstructor): void {
    this.providers.set(providerType.toLowerCase(), constructor);
  }

  /**
   * Get a provider constructor by type
   */
  get(providerType: string): ProviderConstructor | undefined {
    return this.providers.get(providerType.toLowerCase());
  }

  /**
   * Check if a provider type is registered
   */
  has(providerType: string): boolean {
    return this.providers.has(providerType.toLowerCase());
  }

  /**
   * Get all registered provider types
   */
  getAll(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Create a provider instance
   */
  create(
    providerType: string,
    config: ProviderConfig,
    callbackUrl: string,
    storeId: string,
    providerId: string
  ): BaseSsoProvider {
    const Constructor = this.get(providerType);
    if (!Constructor) {
      throw new Error(`Unknown provider type: ${providerType}`);
    }
    return new Constructor(config, callbackUrl, storeId, providerId);
  }
}

// Singleton registry instance
export const providerRegistry = new ProviderRegistry();
