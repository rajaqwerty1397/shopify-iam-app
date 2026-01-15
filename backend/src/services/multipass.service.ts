import crypto from 'crypto';
import { createModuleLogger } from '../lib/logger.js';

const logger = createModuleLogger('MultipassService');

/**
 * Shopify Multipass Service
 *
 * Multipass allows Plus merchants to implement SSO by generating
 * encrypted customer tokens that Shopify accepts for automatic login.
 *
 * @see https://shopify.dev/docs/api/multipass
 */

export interface MultipassCustomerData {
  email: string;
  first_name?: string;
  last_name?: string;
  tag_string?: string;
  identifier?: string;
  remote_ip?: string;
  return_to?: string;
  created_at?: string;
  addresses?: Array<{
    address1?: string;
    address2?: string;
    city?: string;
    company?: string;
    country?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    province?: string;
    zip?: string;
    province_code?: string;
    country_code?: string;
    default?: boolean;
  }>;
}

export class MultipassService {
  private encryptionKey: Buffer;
  private signatureKey: Buffer;

  /**
   * Create a Multipass service for a specific store
   * @param multipassSecret - The store's Multipass secret from Shopify admin
   */
  constructor(multipassSecret: string) {
    if (!multipassSecret || multipassSecret.length < 32) {
      throw new Error('Invalid Multipass secret');
    }

    // Derive keys from the secret using SHA-256
    const keyMaterial = crypto.createHash('sha256').update(multipassSecret).digest();

    // First 16 bytes for encryption, last 16 bytes for signing
    this.encryptionKey = keyMaterial.subarray(0, 16);
    this.signatureKey = keyMaterial.subarray(16, 32);
  }

  /**
   * Generate a Multipass token for customer login
   *
   * @param customerData - Customer information
   * @returns Multipass token URL
   */
  generateToken(customerData: MultipassCustomerData): string {
    try {
      // Validate required fields
      if (!customerData.email) {
        throw new Error('Email is required for Multipass token');
      }

      // Add created_at if not provided (required by Shopify)
      const data = {
        ...customerData,
        created_at: customerData.created_at || new Date().toISOString(),
      };

      // Convert to JSON
      const json = JSON.stringify(data);

      // Generate random IV
      const iv = crypto.randomBytes(16);

      // Encrypt with AES-128-CBC
      const cipher = crypto.createCipheriv('aes-128-cbc', this.encryptionKey, iv);
      const encrypted = Buffer.concat([
        cipher.update(json, 'utf8'),
        cipher.final(),
      ]);

      // Prepend IV to ciphertext
      const ciphertext = Buffer.concat([iv, encrypted]);

      // Sign with HMAC-SHA256
      const signature = crypto
        .createHmac('sha256', this.signatureKey)
        .update(ciphertext)
        .digest();

      // Combine ciphertext and signature
      const token = Buffer.concat([ciphertext, signature]);

      // URL-safe Base64 encode
      return token
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    } catch (error) {
      logger.error({ error }, 'Failed to generate Multipass token');
      throw new Error('Multipass token generation failed');
    }
  }

  /**
   * Generate the full Multipass login URL
   *
   * @param storeDomain - The store's myshopify.com domain
   * @param customerData - Customer information
   * @returns Full URL for Multipass login
   */
  generateLoginUrl(storeDomain: string, customerData: MultipassCustomerData): string {
    const token = this.generateToken(customerData);

    // Remove .myshopify.com if present for the URL
    const cleanDomain = storeDomain.replace('.myshopify.com', '');

    return `https://${cleanDomain}.myshopify.com/account/login/multipass/${token}`;
  }
}

/**
 * Factory function to create a MultipassService for a store
 * Uses the decrypted multipass secret from store credentials
 */
export function createMultipassService(multipassSecret: string): MultipassService {
  return new MultipassService(multipassSecret);
}
