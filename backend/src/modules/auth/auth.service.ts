import crypto from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import { encryptionService } from '../../services/encryption.service.js';
import { passwordService } from '../../services/password.service.js';
import { emailService } from '../../services/email.service.js';
import { generateOtp } from '../../utils/otp.util.js';
import { ssoOtp } from '../../lib/redis.js';
import { createMultipassService } from '../../services/multipass.service.js';
import { createShopifyService } from '../../services/shopify.service.js';
import { config } from '../../config/index.js';
import { ssoUsersService } from '../sso-users/sso-users.service.js';
import { ssoProvidersService } from '../sso-providers/sso-providers.service.js';
import {
  createProvider,
  AuthResult,
  AuthCallbackParams,
  AuthInitiateResult,
} from './providers/index.js';
import {
  StoreNotFoundError,
  StoreInactiveError,
  ProviderNotConfiguredError,
  ProviderDisabledError,
  UserBlockedError,
  ProviderAuthError,
} from '../../common/errors/index.js';
import { StoreCredentials } from '../stores/stores.schema.js';
import { LoginEventType } from '@prisma/client';

const logger = createModuleLogger('AuthService');

/**
 * Login Result
 */
export interface LoginResult {
  success: boolean;
  redirectUrl?: string;
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  method: 'multipass' | 'password' | 'activation_email';
  // For popup mode with password login
  email?: string;
  password?: string;
  returnTo?: string;
}

/**
 * Auth Service
 *
 * Orchestrates the complete SSO authentication flow:
 * 1. Initiate login with IdP
 * 2. Handle callback from IdP
 * 3. Create/update user in database
 * 4. Log in user to Shopify (Multipass for Plus, password for others)
 */
export class AuthService {
  /**
   * Initiate SSO login flow
   */
  async initiateLogin(
    storeId: string,
    providerType: string,
    returnTo?: string
  ): Promise<AuthInitiateResult> {
    // Validate store
    const store = await this.validateStore(storeId);

    // Get provider with config by store and type
    const provider = await ssoProvidersService.findByStoreAndType(storeId, providerType);

    if (!provider.isEnabled) {
      throw new ProviderDisabledError(provider.providerType);
    }

    if (provider.status !== 'active') {
      throw new ProviderNotConfiguredError(provider.providerType);
    }

    // Create provider instance
    const ssoProvider = createProvider({
      providerType: provider.providerType,
      config: provider.decryptedConfig,
      storeId,
      providerId: provider.id,
    });

    // Log login initiated event
    await this.logEvent(storeId, provider.id, null, 'login_initiated');

    // Initiate the authentication flow
    return ssoProvider.initiate(returnTo);
  }

  /**
   * Handle callback from IdP
   */
  async handleCallback(
    storeId: string,
    providerId: string,
    params: AuthCallbackParams,
    clientIp?: string,
    userAgent?: string,
    stateData?: Record<string, unknown>
  ): Promise<LoginResult> {
    // Validate store
    const store = await this.validateStore(storeId);

    // Get provider with config
    const provider = await ssoProvidersService.findByIdWithConfig(providerId);

    // Get store credentials
    const storeWithCreds = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!storeWithCreds) {
      throw new StoreNotFoundError();
    }

    const credentials = encryptionService.decrypt<StoreCredentials>(storeWithCreds.credentials);

    // Validate access token
    if (!credentials.accessToken || credentials.accessToken.trim() === '') {
      logger.error({ storeId, storeDomain: store.domain }, 'Access token is missing or empty');
      throw new Error('Shopify access token is missing. Please re-authenticate the app in Shopify Admin.');
    }

    try {
      // Create provider instance and handle callback
      const ssoProvider = createProvider({
        providerType: provider.providerType,
        config: provider.decryptedConfig,
        storeId,
        providerId,
      });

      // Pass stateData to provider if available (for OIDC providers to avoid double consumption)
      const authResult = await ssoProvider.handleCallback(params, stateData);

      // Create or update SSO user
      const ssoUser = await ssoUsersService.upsert(
        {
          storeId,
          ssoProviderId: providerId,
          idpCustomerId: authResult.user.id,
          email: authResult.user.email,
          firstName: authResult.user.firstName,
          lastName: authResult.user.lastName,
          profileData: authResult.user.rawProfile,
        },
        store.domain
      );

      // Check if user is blocked
      if (ssoUser.status === 'blocked') {
        await this.logEvent(storeId, providerId, ssoUser.id, 'login_failed', clientIp, userAgent, 'USER_BLOCKED');
        throw new UserBlockedError();
      }

      // Extract isPopup from stateData if available
      const isPopup = stateData?.isPopup === true;

      // Login to Shopify
      const loginResult = await this.loginToShopify(
        store,
        credentials,
        ssoUser,
        authResult.user,
        isPopup
      );

      // Log success
      await this.logEvent(storeId, providerId, ssoUser.id, 'login_success', clientIp, userAgent);

      return {
        success: true,
        redirectUrl: loginResult.redirectUrl,
        user: {
          id: ssoUser.id,
          email: ssoUser.email,
          firstName: ssoUser.firstName || undefined,
          lastName: ssoUser.lastName || undefined,
        },
        method: loginResult.method,
        // Include credentials for popup mode
        email: loginResult.email,
        password: loginResult.password,
        returnTo: loginResult.returnTo,
      };
    } catch (error) {
      // Log failure
      const errorCode = error instanceof Error ? error.constructor.name : 'UNKNOWN';
      await this.logEvent(storeId, providerId, null, 'login_failed', clientIp, userAgent, errorCode, {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Login user to Shopify
   */
  private async loginToShopify(
    store: { id: string; domain: string; isPlus: boolean },
    credentials: StoreCredentials,
    ssoUser: { id: string; email: string; firstName: string | null; lastName: string | null; idpCustomerId: string; platformCustomerId: string | null },
    userProfile: { email: string; firstName?: string; lastName?: string },
    isPopup?: boolean
  ): Promise<{ redirectUrl?: string; method: 'multipass' | 'password' | 'activation_email'; email?: string; password?: string; returnTo?: string }> {
    const returnUrl = `https://${store.domain}/account`;

    logger.info({
      storeDomain: store.domain,
      isPlus: store.isPlus,
      hasMultipassSecret: !!credentials.multipassSecret,
      hasAccessToken: !!credentials.accessToken,
      userEmail: userProfile.email,
      isPopup,
    }, 'loginToShopify: Determining login method');

    if (store.isPlus && credentials.multipassSecret) {
      // Use Multipass for Plus stores
      logger.info({ method: 'multipass' }, 'Using Multipass login for Plus store');
      return this.loginWithMultipass(store.domain, credentials.multipassSecret, userProfile, returnUrl);
    } else {
      // Use password-based login for non-Plus stores
      logger.info({ method: 'password' }, 'Using password login for non-Plus store');
      return this.loginWithPassword(store, credentials, ssoUser, userProfile, returnUrl, isPopup);
    }
  }

  /**
   * Login using Shopify Multipass (Plus stores)
   */
  private async loginWithMultipass(
    storeDomain: string,
    multipassSecret: string,
    userProfile: { email: string; firstName?: string; lastName?: string },
    returnTo: string
  ): Promise<{ redirectUrl: string; method: 'multipass' }> {
    const multipass = createMultipassService(multipassSecret);

    const redirectUrl = multipass.generateLoginUrl(storeDomain, {
      email: userProfile.email,
      first_name: userProfile.firstName,
      last_name: userProfile.lastName,
      return_to: returnTo,
      created_at: new Date().toISOString(),
    });

    logger.info({ storeDomain, email: userProfile.email }, 'Multipass login generated');

    return { redirectUrl, method: 'multipass' };
  }

  /**
   * Login using password (for non-Plus stores)
   * This creates/updates customer with a deterministic password and returns credentials for auto-fill
   */
  private async loginWithPassword(
    store: { id: string; domain: string },
    credentials: StoreCredentials,
    ssoUser: { id: string; email: string; firstName: string | null; lastName: string | null; idpCustomerId: string; platformCustomerId: string | null },
    userProfile: { email: string; firstName?: string; lastName?: string },
    returnTo: string,
    isPopup?: boolean
  ): Promise<{ redirectUrl?: string; method: 'password'; email?: string; password?: string; returnTo?: string }> {
    logger.info({
      storeDomain: store.domain,
      hasAccessToken: !!credentials.accessToken,
      accessTokenLength: credentials.accessToken?.length,
      email: userProfile.email,
    }, 'Starting direct password login flow (no OTP)');

    try {
      const shopify = createShopifyService(store.domain, credentials.accessToken);

      // Check if customer exists in Shopify
      let customerId = ssoUser.platformCustomerId;

      if (!customerId) {
        logger.info({ email: userProfile.email }, 'Finding or creating customer in Shopify');
        // Find or create customer in Shopify
        const existingCustomer = await shopify.findCustomerByEmail(userProfile.email);

        if (existingCustomer) {
          logger.info({ customerId: existingCustomer.id }, 'Found existing customer');
          customerId = String(existingCustomer.id);
        } else {
          logger.info({ email: userProfile.email }, 'Creating new customer');
          // Generate deterministic password for the customer
          const password = passwordService.generatePassword(store.domain, userProfile.email);
          
          // Create customer with password
          const newCustomer = await shopify.createCustomer({
            email: userProfile.email,
            password: password,
            password_confirmation: password,
            firstName: userProfile.firstName,
            lastName: userProfile.lastName,
            tags: ['sso-user'],
            sendEmailInvite: false, // Don't send activation email - we'll log them in directly
          });
          customerId = String(newCustomer.id);
          logger.info({ customerId }, 'Created new customer with password');
        }

        // Update SSO user with Shopify customer ID
        await prisma.ssoUser.update({
          where: { id: ssoUser.id },
          data: { platformCustomerId: customerId },
        });
      }

      // Generate deterministic password for this user
      const password = passwordService.generatePassword(store.domain, userProfile.email);
      
      // Update customer password in Shopify (in case it was different)
      try {
        await shopify.updateCustomerPassword(parseInt(customerId), password);
        logger.info({ customerId }, 'Customer password updated');
      } catch (pwdError) {
        logger.warn({ 
          error: pwdError instanceof Error ? pwdError.message : String(pwdError),
          customerId 
        }, 'Failed to update customer password, continuing with existing password');
      }

      logger.info({ 
        storeDomain: store.domain, 
        email: userProfile.email,
        customerId,
      }, 'Password login ready - returning credentials for auto-fill');

      // Return credentials for auto-fill on storefront
      return { 
        method: 'password', 
        email: userProfile.email, 
        password: password,
        returnTo 
      };
    } catch (error) {
      logger.error({
        storeDomain: store.domain,
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
      }, 'Password login flow failed');
      throw error;
    }
  }

  /**
   * Validate store is active
   */
  private async validateStore(storeId: string): Promise<{ id: string; domain: string; isPlus: boolean }> {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, domain: true, isPlus: true, status: true },
    });

    if (!store) {
      throw new StoreNotFoundError();
    }

    if (store.status !== 'active') {
      throw new StoreInactiveError();
    }

    return store;
  }

  /**
   * Log authentication event
   */
  private async logEvent(
    storeId: string,
    providerId: string,
    userId: string | null,
    eventType: LoginEventType,
    ipAddress?: string,
    userAgent?: string,
    errorCode?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.loginEvent.create({
        data: {
          storeId,
          ssoProviderId: providerId,
          ssoUserId: userId,
          eventType,
          ipAddress,
          userAgent,
          errorCode,
          metadata: metadata as Record<string, unknown>,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to log event');
    }
  }

  /**
   * Get login events for analytics
   */
  async getLoginEvents(
    storeId: string,
    options: {
      page?: number;
      limit?: number;
      startDate?: Date;
      endDate?: Date;
      eventType?: LoginEventType;
    } = {}
  ) {
    const { page = 1, limit = 50, startDate, endDate, eventType } = options;

    const where: Record<string, unknown> = { storeId };

    if (eventType) {
      where.eventType = eventType;
    }

    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const [events, total] = await Promise.all([
      prisma.loginEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          ssoProvider: { select: { displayName: true, providerType: true } },
          ssoUser: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
      prisma.loginEvent.count({ where }),
    ]);

    return {
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

// Singleton instance
export const authService = new AuthService();
