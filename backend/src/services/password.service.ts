import crypto from 'crypto';
import { config } from '../config/index.js';
import { createModuleLogger } from '../lib/logger.js';

const logger = createModuleLogger('PasswordService');

/**
 * Password Service
 *
 * Generates secure passwords for non-Plus Shopify stores.
 * Each store has a unique salt derived from its domain/ID.
 *
 * This allows us to create Shopify customers with deterministic passwords
 * so users can be logged in automatically after SSO authentication.
 */
export class PasswordService {
  private readonly pepper: string;
  private readonly iterations = 100000;
  private readonly keyLength = 32;
  private readonly digest = 'sha256';

  constructor() {
    this.pepper = config.encryption.pepper;
    if (this.pepper.length < 16) {
      throw new Error('PASSWORD_PEPPER must be at least 16 characters');
    }
  }

  /**
   * Generate a store-specific salt
   * @param storeDomain - The store's myshopify.com domain
   * @returns Deterministic salt for this store
   */
  private generateStoreSalt(storeDomain: string): Buffer {
    return crypto
      .createHmac('sha256', this.pepper)
      .update(storeDomain.toLowerCase())
      .digest();
  }

  /**
   * Generate a secure, deterministic password for a user
   *
   * The password is derived from:
   * 1. Store domain (makes each store's passwords unique)
   * 2. User's IdP ID (makes each user's password unique)
   * 3. System pepper (adds security layer)
   *
   * @param storeDomain - The store's domain
   * @param userIdpId - The user's ID from the identity provider
   * @returns A secure password string (20 characters)
   */
  generatePassword(storeDomain: string, userIdpId: string): string {
    try {
      const salt = this.generateStoreSalt(storeDomain);

      // Create input combining user ID and additional entropy
      const input = `${userIdpId}:${this.pepper}:persona-sso`;

      // Derive key using PBKDF2
      const derivedKey = crypto.pbkdf2Sync(
        input,
        salt,
        this.iterations,
        this.keyLength,
        this.digest
      );

      // Convert to URL-safe base64 and take first 20 characters
      // This creates a strong password that's consistent for the same user
      const password = derivedKey
        .toString('base64')
        .replace(/\+/g, 'A')
        .replace(/\//g, 'B')
        .replace(/=/g, '')
        .substring(0, 20);

      return password;
    } catch (error) {
      logger.error({ error, storeDomain }, 'Password generation failed');
      throw new Error('Failed to generate password');
    }
  }

  /**
   * Hash a password for storage
   * Uses Argon2-like structure with PBKDF2 (for Node.js compatibility)
   *
   * @param password - The password to hash
   * @param storeDomain - The store's domain (used for unique salt)
   * @returns Hash string for database storage
   */
  hashPassword(password: string, storeDomain: string): string {
    try {
      // Generate a random salt for this specific hash
      const randomSalt = crypto.randomBytes(16);

      // Combine with store-specific salt
      const storeSalt = this.generateStoreSalt(storeDomain);
      const combinedSalt = Buffer.concat([randomSalt, storeSalt]);

      // Hash the password
      const hash = crypto.pbkdf2Sync(
        password,
        combinedSalt,
        this.iterations,
        this.keyLength,
        this.digest
      );

      // Format: $persona$v1$iterations$randomSalt$hash
      return [
        '$persona',
        'v1',
        this.iterations.toString(),
        randomSalt.toString('base64'),
        hash.toString('base64'),
      ].join('$');
    } catch (error) {
      logger.error({ error }, 'Password hashing failed');
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify a password against a stored hash
   *
   * @param password - The password to verify
   * @param hash - The stored hash
   * @param storeDomain - The store's domain
   * @returns True if password matches
   */
  verifyPassword(password: string, hash: string, storeDomain: string): boolean {
    try {
      const parts = hash.split('$');
      if (parts.length !== 6 || parts[1] !== 'persona' || parts[2] !== 'v1') {
        return false;
      }

      const iterations = parseInt(parts[3]!, 10);
      const randomSalt = Buffer.from(parts[4]!, 'base64');
      const storedHash = Buffer.from(parts[5]!, 'base64');

      // Recreate the combined salt
      const storeSalt = this.generateStoreSalt(storeDomain);
      const combinedSalt = Buffer.concat([randomSalt, storeSalt]);

      // Hash the provided password
      const computedHash = crypto.pbkdf2Sync(
        password,
        combinedSalt,
        iterations,
        this.keyLength,
        this.digest
      );

      // Constant-time comparison
      return crypto.timingSafeEqual(storedHash, computedHash);
    } catch (error) {
      logger.error({ error }, 'Password verification failed');
      return false;
    }
  }

  /**
   * Generate a random secure password
   * Used for account recovery or admin-generated passwords
   *
   * @param length - Password length (default 16)
   * @returns Random password string
   */
  generateRandomPassword(length = 16): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    const randomBytes = crypto.randomBytes(length);
    let password = '';

    for (let i = 0; i < length; i++) {
      password += chars[randomBytes[i]! % chars.length];
    }

    return password;
  }
}

// Singleton instance
export const passwordService = new PasswordService();
