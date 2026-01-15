import crypto from 'crypto';
import { config } from '../config/index.js';
import { createModuleLogger } from '../lib/logger.js';

const logger = createModuleLogger('ShopifyService');

/**
 * Shopify API Service
 *
 * Handles all Shopify API interactions including:
 * - Customer creation/management
 * - App installation verification
 * - Webhook handling
 */

export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  tags?: string;
  verified_email?: boolean;
  accepts_marketing?: boolean;
  created_at?: string;
  updated_at?: string;
  state?: string;
}

export interface CreateCustomerInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tags?: string[];
  sendEmailInvite?: boolean;
  acceptsMarketing?: boolean;
}

export class ShopifyService {
  private readonly storeDomain: string;
  private readonly accessToken: string;
  private readonly apiVersion = '2024-01';

  constructor(storeDomain: string, accessToken: string) {
    this.storeDomain = storeDomain.replace('.myshopify.com', '');
    this.accessToken = accessToken;
  }

  /**
   * Make an authenticated request to Shopify Admin API
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `https://${this.storeDomain}.myshopify.com/admin/api/${this.apiVersion}${endpoint}`;

    logger.info({
      method,
      endpoint,
      url,
      hasAccessToken: !!this.accessToken,
      accessTokenLength: this.accessToken?.length,
    }, 'Making Shopify API request');

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(
        { 
          status: response.status, 
          error, 
          endpoint, 
          url,
          method,
          storeDomain: this.storeDomain,
          responseHeaders: Object.fromEntries(response.headers.entries()),
        },
        'Shopify API error - DETAILED'
      );
      throw new ShopifyApiError(
        `Shopify API error: ${response.status} - ${error.substring(0, 200)}`,
        response.status,
        error
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Find a customer by email
   */
  async findCustomerByEmail(email: string): Promise<ShopifyCustomer | null> {
    try {
      const result = await this.request<{ customers: ShopifyCustomer[] }>(
        'GET',
        `/customers/search.json?query=email:${encodeURIComponent(email)}`
      );

      return result.customers[0] || null;
    } catch (error) {
      logger.error({ error, email }, 'Failed to find customer');
      throw error;
    }
  }

  /**
   * Create a new customer
   */
  async createCustomer(input: CreateCustomerInput): Promise<ShopifyCustomer> {
    try {
      const result = await this.request<{ customer: ShopifyCustomer }>(
        'POST',
        '/customers.json',
        {
          customer: {
            email: input.email,
            password: input.password,
            password_confirmation: input.password,
            first_name: input.firstName,
            last_name: input.lastName,
            phone: input.phone,
            tags: input.tags?.join(', '),
            send_email_invite: input.sendEmailInvite ?? false,
            accepts_marketing: input.acceptsMarketing ?? false,
            verified_email: true, // SSO-verified
          },
        }
      );

      logger.info(
        { customerId: result.customer.id, email: input.email },
        'Customer created'
      );

      return result.customer;
    } catch (error) {
      logger.error({ error, email: input.email }, 'Failed to create customer');
      throw error;
    }
  }

  /**
   * Update an existing customer
   */
  async updateCustomer(
    customerId: number,
    updates: Partial<CreateCustomerInput>
  ): Promise<ShopifyCustomer> {
    try {
      const result = await this.request<{ customer: ShopifyCustomer }>(
        'PUT',
        `/customers/${customerId}.json`,
        {
          customer: {
            first_name: updates.firstName,
            last_name: updates.lastName,
            phone: updates.phone,
            tags: updates.tags?.join(', '),
            accepts_marketing: updates.acceptsMarketing,
          },
        }
      );

      return result.customer;
    } catch (error) {
      logger.error({ error, customerId }, 'Failed to update customer');
      throw error;
    }
  }

  /**
   * Update customer password
   */
  async updateCustomerPassword(
    customerId: number,
    newPassword: string
  ): Promise<void> {
    try {
      await this.request('PUT', `/customers/${customerId}.json`, {
        customer: {
          password: newPassword,
          password_confirmation: newPassword,
        },
      });

      logger.info({ customerId }, 'Customer password updated');
    } catch (error) {
      logger.error({ error, customerId }, 'Failed to update customer password');
      throw error;
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: number): Promise<ShopifyCustomer> {
    const result = await this.request<{ customer: ShopifyCustomer }>(
      'GET',
      `/customers/${customerId}.json`
    );
    return result.customer;
  }

  /**
   * Add tags to a customer
   */
  async addCustomerTags(customerId: number, tags: string[]): Promise<void> {
    const customer = await this.getCustomer(customerId);
    const existingTags = customer.tags?.split(', ').filter(Boolean) || [];
    const newTags = [...new Set([...existingTags, ...tags])];

    await this.request('PUT', `/customers/${customerId}.json`, {
      customer: { tags: newTags.join(', ') },
    });
  }


  /**
   * Create customer and get account activation URL (for custom email sending)
   */
  async createCustomerWithActivationUrl(input: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    tags?: string[];
    acceptsMarketing?: boolean;
  }): Promise<{ customer: ShopifyCustomer; activationUrl: string }> {
    try {
      // Generate a random password (customer will set their own via activation email)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      
      // Create customer WITHOUT sending email (send_email_invite: false)
      // We'll send custom email via SendGrid
      const result = await this.request<{ customer: ShopifyCustomer }>(
        'POST',
        '/customers.json',
        {
          customer: {
            email: input.email,
            password: randomPassword,
            password_confirmation: randomPassword,
            first_name: input.firstName,
            last_name: input.lastName,
            phone: input.phone,
            tags: input.tags?.join(', '),
            send_email_invite: false, // Don't send Shopify's default email
            accepts_marketing: input.acceptsMarketing ?? false,
            verified_email: true, // SSO-verified
          },
        }
      );

      // Get account activation URL
      const activationResult = await this.request<{ account_activation_url: string }>(
        'POST',
        `/customers/${result.customer.id}/account_activation_url.json`
      );

      logger.info(
        { customerId: result.customer.id, email: input.email },
        'Customer created with activation URL generated'
      );

      return {
        customer: result.customer,
        activationUrl: activationResult.account_activation_url,
      };
    } catch (error) {
      logger.error({ error, email: input.email }, 'Failed to create customer with activation URL');
      throw error;
    }
  }

  /**
   * Get account activation URL for existing customer
   */
  async getAccountActivationUrl(customerId: number): Promise<string> {
    try {
      const result = await this.request<{ account_activation_url: string }>(
        'POST',
        `/customers/${customerId}/account_activation_url.json`
      );

      logger.info({ customerId }, 'Account activation URL generated');
      return result.account_activation_url;
    } catch (error) {
      logger.error({ error, customerId }, 'Failed to get account activation URL');
      throw error;
    }
  }

  /**
   * Verify Shopify webhook signature
   */
  static verifyWebhookSignature(
    body: string | Buffer,
    hmacHeader: string
  ): boolean {
    const hash = crypto
      .createHmac('sha256', config.shopify.apiSecret)
      .update(body)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(hmacHeader)
    );
  }

  /**
   * Verify Shopify request signature (for OAuth)
   */
  static verifyRequestSignature(query: Record<string, string>): boolean {
    const { hmac, ...params } = query;
    if (!hmac) return false;

    const message = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    const hash = crypto
      .createHmac('sha256', config.shopify.apiSecret)
      .update(message)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
  }
}

/**
 * Custom error class for Shopify API errors
 */
export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'ShopifyApiError';
  }
}

/**
 * Factory function to create ShopifyService
 */
export function createShopifyService(
  storeDomain: string,
  accessToken: string
): ShopifyService {
  return new ShopifyService(storeDomain, accessToken);
}
