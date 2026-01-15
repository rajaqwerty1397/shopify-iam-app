import crypto from 'crypto';
import { config } from '../config/index.js';
import { createModuleLogger } from '../lib/logger.js';

const logger = createModuleLogger('EncryptionService');

/**
 * AES-256-GCM Encryption Service
 *
 * Provides secure encryption/decryption for sensitive data stored in the database.
 * Uses authenticated encryption to ensure both confidentiality and integrity.
 *
 * Format: v1:base64(iv):base64(authTag):base64(ciphertext)
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly authTagLength = 16; // 128 bits
  private readonly version = 'v1';
  private key: Buffer;

  constructor() {
    const keyHex = config.encryption.key;
    if (keyHex.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    this.key = Buffer.from(keyHex, 'hex');
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param data - String or object to encrypt
   * @returns Encrypted string in format: v1:iv:authTag:ciphertext
   */
  encrypt(data: string | Record<string, unknown>): string {
    try {
      const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
      const iv = crypto.randomBytes(this.ivLength);

      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv, {
        authTagLength: this.authTagLength,
      });

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      return [
        this.version,
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
      ].join(':');
    } catch (error) {
      logger.error({ error }, 'Encryption failed');
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data encrypted with AES-256-GCM
   * @param encryptedData - Encrypted string from encrypt()
   * @returns Original data (parsed as JSON if possible)
   */
  decrypt<T = unknown>(encryptedData: string): T {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 4) {
        throw new Error('Invalid encrypted data format');
      }

      const [version, ivB64, authTagB64, ciphertextB64] = parts;

      if (version !== this.version) {
        throw new Error(`Unsupported encryption version: ${version}`);
      }

      const iv = Buffer.from(ivB64!, 'base64');
      const authTag = Buffer.from(authTagB64!, 'base64');
      const ciphertext = Buffer.from(ciphertextB64!, 'base64');

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv, {
        authTagLength: this.authTagLength,
      });
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      const plaintext = decrypted.toString('utf8');

      // Try to parse as JSON
      try {
        return JSON.parse(plaintext) as T;
      } catch {
        return plaintext as T;
      }
    } catch (error) {
      logger.error({ error }, 'Decryption failed');
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Check if a string is encrypted by this service
   */
  isEncrypted(data: string): boolean {
    if (!data || typeof data !== 'string') return false;
    const parts = data.split(':');
    return parts.length === 4 && parts[0] === this.version;
  }

  /**
   * Generate a secure random key for encryption
   * @returns 64 character hex string (32 bytes)
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();
