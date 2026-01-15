import crypto from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import { config } from '../../config/index.js';
import { encryptionService } from '../../services/encryption.service.js';
import {
  ShopifyShopInfo,
  ShopifyOAuthTokenResponse,
  StoreInstallationResult,
} from './shopify-oauth.schema.js';
import { StoreCredentials } from '../stores/stores.schema.js';

const logger = createModuleLogger('ShopifyOAuthService');

/**
 * Shopify OAuth Service
 *
 * Handles Shopify app installation OAuth flow:
 * 1. Generate OAuth authorization URL
 * 2. Exchange authorization code for access token
 * 3. Fetch shop information
 * 4. Create/update store in database
 * 5. Assign free plan subscription
 */
export class ShopifyOAuthService {
  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(shop: string, state?: string): string {
    const nonce = state || crypto.randomBytes(16).toString('hex');
    const scopes = config.shopify.scopes.join(',');
    const redirectUri = `${config.app.url}/api/shopify/auth/callback`;

    const params = new URLSearchParams({
      client_id: config.shopify.apiKey,
      scope: scopes,
      redirect_uri: redirectUri,
      state: nonce,
    });

    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  /**
   * Verify HMAC signature from Shopify
   */
  verifyHmac(query: Record<string, string>): boolean {
    const { hmac, signature, ...params } = query;
    if (!hmac) return false;

    // Sort and encode parameters
    const message = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    const hash = crypto
      .createHmac('sha256', config.shopify.apiSecret)
      .update(message)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
    } catch {
      return false;
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(shop: string, code: string): Promise<ShopifyOAuthTokenResponse> {
    const url = `https://${shop}/admin/oauth/access_token`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: config.shopify.apiKey,
        client_secret: config.shopify.apiSecret,
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ status: response.status, error, shop }, 'Failed to exchange code for token');
      throw new Error(`Failed to get access token: ${response.status}`);
    }

    return response.json() as Promise<ShopifyOAuthTokenResponse>;
  }

  /**
   * Fetch shop information from Shopify
   */
  async fetchShopInfo(shop: string, accessToken: string): Promise<ShopifyShopInfo> {
    const url = `https://${shop}/admin/api/2024-01/shop.json`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ status: response.status, error, shop }, 'Failed to fetch shop info');
      throw new Error(`Failed to fetch shop info: ${response.status}`);
    }

    const data = await response.json() as { shop: ShopifyShopInfo };
    return data.shop;
  }

  /**
   * Get or create the Shopify SSO app platform
   */
  private async getOrCreateAppPlatform(): Promise<number> {
    // First, ensure Platform exists
    let platform = await prisma.platform.findUnique({
      where: { name: 'Shopify' },
    });

    if (!platform) {
      platform = await prisma.platform.create({
        data: {
          name: 'Shopify',
          status: 'ACTIVE',
          config: {
            apiVersion: '2024-01',
            scopes: config.shopify.scopes,
          },
        },
      });
      logger.info({ platformId: platform.id }, 'Created Shopify platform');
    }

    // Ensure Application exists
    let application = await prisma.application.findUnique({
      where: { name: 'Persona SSO' },
    });

    if (!application) {
      application = await prisma.application.create({
        data: {
          name: 'Persona SSO',
          description: 'Enterprise Single Sign-On solution',
          status: 'ACTIVE',
          settings: {
            defaultProtocol: 'oidc',
            supportedProviders: ['google', 'microsoft', 'facebook', 'okta', 'azure'],
          },
        },
      });
      logger.info({ applicationId: application.id }, 'Created Persona SSO application');
    }

    // Ensure AppPlatform exists
    let appPlatform = await prisma.appPlatform.findUnique({
      where: {
        applicationId_platformId: {
          applicationId: application.id,
          platformId: platform.id,
        },
      },
    });

    if (!appPlatform) {
      appPlatform = await prisma.appPlatform.create({
        data: {
          applicationId: application.id,
          platformId: platform.id,
          status: 'ACTIVE',
          config: {
            multipassEnabled: true,
            customerTagsEnabled: true,
          },
        },
      });
      logger.info({ appPlatformId: appPlatform.id }, 'Created Shopify SSO app platform');
    }

    return appPlatform.id;
  }

  /**
   * Get or create the Free plan
   */
  private async getOrCreateFreePlan(appPlatformId: number): Promise<number> {
    let freePlan = await prisma.plan.findFirst({
      where: {
        appPlatformId,
        name: 'Free',
      },
    });

    if (!freePlan) {
      freePlan = await prisma.plan.create({
        data: {
          appPlatformId,
          name: 'Free',
          description: 'Free plan - Perfect for trying out SSO',
          monthlyPrice: 0,
          annualPrice: 0,
          userLimit: 100,
          trialDays: 0,
          isActive: true,
          displayOrder: 1,
          features: {
            maxProviders: 1,
            customBranding: false,
            analytics: false,
            prioritySupport: false,
          },
        },
      });
      logger.info({ planId: freePlan.id }, 'Created Free plan');
    }

    return freePlan.id;
  }

  /**
   * Install app for a store - main entry point
   */
  async installStore(
    shop: string,
    code: string
  ): Promise<StoreInstallationResult> {
    // 1. Exchange code for access token
    const tokenResponse = await this.exchangeCodeForToken(shop, code);
    const { access_token: accessToken, scope } = tokenResponse;

    // 2. Fetch shop information
    const shopInfo = await this.fetchShopInfo(shop, accessToken);

    // 3. Get or create app platform
    const appPlatformId = await this.getOrCreateAppPlatform();

    // 4. Get or create free plan
    const freePlanId = await this.getOrCreateFreePlan(appPlatformId);

    // 5. Check if store already exists
    const existingStore = await prisma.store.findUnique({
      where: { domain: shop },
      include: { subscription: true },
    });

    // 6. Determine if this is a Plus store
    const isPlus = shopInfo.plan_name?.toLowerCase().includes('plus') || 
                   shopInfo.plan_name?.toLowerCase().includes('enterprise');

    // 7. Encrypt credentials
    const credentials: StoreCredentials = {
      accessToken,
      scopes: scope.split(','),
      multipassSecret: null, // Will be set separately if Plus store
    };
    const encryptedCredentials = encryptionService.encrypt(credentials);

    let store;
    let subscription;

    if (existingStore) {
      // Update existing store - IMPORTANT: Always update credentials on reinstall
      logger.info({ 
        storeId: existingStore.id, 
        shop,
        previousStatus: existingStore.status,
        accessTokenLength: accessToken.length,
        scopes: scope,
      }, 'Reinstalling store - updating credentials');
      
      store = await prisma.store.update({
        where: { id: existingStore.id },
        data: {
          name: shopInfo.name,
          ownerEmail: shopInfo.email,
          credentials: encryptedCredentials, // CRITICAL: Always update with new token
          isPlus,
          country: shopInfo.country_code,
          status: 'active', // Reactivate if uninstalled
          metadata: {
            shopifyId: shopInfo.id,
            planName: shopInfo.plan_name,
            planDisplayName: shopInfo.plan_display_name,
            currency: shopInfo.currency,
            timezone: shopInfo.timezone,
            installedScopes: scope,
            reinstalledAt: new Date().toISOString(),
            previousInstallationCleared: true,
          },
        },
      });

      // Verify credentials were updated
      const verifyStore = await prisma.store.findUnique({
        where: { id: store.id },
        select: { credentials: true },
      });
      const verifyCreds = encryptionService.decrypt<StoreCredentials>(verifyStore!.credentials);
      logger.info({ 
        storeId: store.id,
        newTokenLength: verifyCreds.accessToken.length,
        newTokenPreview: verifyCreds.accessToken.substring(0, 15) + '...',
        tokenMatches: verifyCreds.accessToken === accessToken,
      }, 'Credentials updated - verification');

      // Ensure subscription exists and is active
      if (existingStore.subscription) {
        // Reactivate subscription if it was cancelled/expired
        if (existingStore.subscription.status !== 'active' && existingStore.subscription.status !== 'trialing') {
          subscription = await prisma.subscription.update({
            where: { id: existingStore.subscription.id },
            data: {
              status: 'active',
              planId: freePlanId, // Reset to free plan on reinstall
            },
          });
        } else {
          subscription = existingStore.subscription;
        }
      } else {
        subscription = await prisma.subscription.create({
          data: {
            storeId: store.id,
            planId: freePlanId,
            status: 'active',
            billingCycle: 'monthly',
            currentUserCount: 0,
          },
        });
      }

      logger.info({ storeId: store.id, shop, accessTokenLength: accessToken.length }, 'Store reinstalled - credentials updated');
    } else {
      // Create new store with subscription in transaction
      const result = await prisma.$transaction(async (tx) => {
        const newStore = await tx.store.create({
          data: {
            appPlatformId,
            platformStoreId: String(shopInfo.id),
            domain: shop,
            name: shopInfo.name,
            ownerEmail: shopInfo.email,
            credentials: encryptedCredentials,
            isPlus,
            country: shopInfo.country_code,
            status: 'active',
            metadata: {
              shopifyId: shopInfo.id,
              planName: shopInfo.plan_name,
              planDisplayName: shopInfo.plan_display_name,
              currency: shopInfo.currency,
              timezone: shopInfo.timezone,
              installedScopes: scope,
              installedAt: new Date().toISOString(),
            },
          },
        });

        const newSubscription = await tx.subscription.create({
          data: {
            storeId: newStore.id,
            planId: freePlanId,
            status: 'active',
            billingCycle: 'monthly',
            currentUserCount: 0,
          },
        });

        return { store: newStore, subscription: newSubscription };
      });

      store = result.store;
      subscription = result.subscription;

      logger.info(
        { storeId: store.id, shop, planId: freePlanId },
        'New store installed with Free plan'
      );
    }

    // 8. Return result
    // Extract store name from domain (e.g., "notiftest-2" from "notiftest-2.myshopify.com")
    const storeName = shop.replace('.myshopify.com', '');

    return {
      storeId: store.id,
      domain: store.domain,
      name: store.name,
      isPlus,
      planId: freePlanId,
      subscriptionId: subscription.id,
      redirectUrl: `https://admin.shopify.com/store/${storeName}/apps/${config.shopify.appHandle}`,
    };
  }

  /**
   * Handle app uninstall webhook
   * 
   * IMPORTANT: This clears the access token immediately when the app is uninstalled.
   * The token becomes invalid and cannot be used for any Shopify API calls.
   */
  async handleUninstall(shop: string): Promise<void> {
    logger.info({ shop }, 'Processing uninstall webhook');

    const store = await prisma.store.findUnique({
      where: { domain: shop },
      select: { id: true, domain: true, status: true, credentials: true },
    });

    if (!store) {
      logger.warn({ shop }, 'Uninstall webhook for unknown store - ignoring');
      return;
    }

    // Check if already uninstalled
    if (store.status === 'uninstalled') {
      logger.info({ storeId: store.id, shop }, 'Store already marked as uninstalled - clearing credentials again');
    }

    // Decrypt current credentials to log what we're clearing (for debugging)
    let previousTokenPreview = 'unknown';
    try {
      const currentCreds = encryptionService.decrypt<StoreCredentials>(store.credentials);
      if (currentCreds.accessToken) {
        previousTokenPreview = currentCreds.accessToken.substring(0, 15) + '...';
      }
    } catch (error) {
      logger.warn({ storeId: store.id }, 'Could not decrypt existing credentials');
    }

    // Clear credentials on uninstall - encrypt empty credentials to invalidate token
    // This ensures the token cannot be used even if someone tries to decrypt it
    const emptyCredentials: StoreCredentials = {
      accessToken: '', // Empty string = invalid token
      scopes: [],
      multipassSecret: null,
    };
    const encryptedEmptyCredentials = encryptionService.encrypt(emptyCredentials);

    await prisma.store.update({
      where: { id: store.id },
      data: {
        status: 'uninstalled',
        credentials: encryptedEmptyCredentials, // CRITICAL: Clear/invalidate access token
        metadata: {
          ...(store.metadata as object || {}),
          uninstalledAt: new Date().toISOString(),
          previousAccessTokenRevoked: true,
          previousTokenCleared: true,
        },
      },
    });

    // Verify credentials were cleared
    const verifyStore = await prisma.store.findUnique({
      where: { id: store.id },
      select: { credentials: true },
    });
    const verifyCreds = encryptionService.decrypt<StoreCredentials>(verifyStore!.credentials);
    
    logger.info({ 
      storeId: store.id, 
      shop,
      previousTokenPreview,
      tokenCleared: verifyCreds.accessToken === '',
      credentialsEmpty: verifyCreds.accessToken === '' && verifyCreds.scopes.length === 0,
    }, 'Store uninstalled - credentials cleared and verified');
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body: string | Buffer, hmacHeader: string): boolean {
    const hash = crypto
      .createHmac('sha256', config.shopify.apiSecret)
      .update(body)
      .digest('base64');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(hash),
        Buffer.from(hmacHeader)
      );
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const shopifyOAuthService = new ShopifyOAuthService();
