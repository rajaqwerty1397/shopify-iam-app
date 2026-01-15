import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

// Create Redis client
export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  lazyConnect: true,
  enableReadyCheck: true,
  connectTimeout: 5000,
});

// Event handlers
redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis error');
});

redis.on('close', () => {
  logger.info('Redis connection closed');
});

// Helper functions for SSO state management
export const ssoState = {
  /**
   * Store OIDC/SAML state for CSRF protection
   * TTL: 10 minutes
   */
  async set(state: string, data: Record<string, unknown>): Promise<void> {
    await redis.setex(`sso:state:${state}`, 600, JSON.stringify(data));
  },

  /**
   * Get state without consuming it (for checking if it exists)
   */
  async get(state: string): Promise<Record<string, unknown> | null> {
    const data = await redis.get(`sso:state:${state}`);
    if (!data) return null;
    return JSON.parse(data);
  },

  /**
   * Get and delete state (one-time use)
   */
  async consume(state: string): Promise<Record<string, unknown> | null> {
    const data = await redis.get(`sso:state:${state}`);
    if (!data) return null;

    await redis.del(`sso:state:${state}`);
    return JSON.parse(data);
  },

  /**
   * Store SAML InResponseTo for replay prevention
   * TTL: 5 minutes
   */
  async setInResponseTo(requestId: string, storeId: string): Promise<void> {
    await redis.setex(`saml:request:${requestId}`, 300, storeId);
  },

  /**
   * Validate and consume SAML InResponseTo
   */
  async validateInResponseTo(requestId: string): Promise<string | null> {
    const storeId = await redis.get(`saml:request:${requestId}`);
    if (!storeId) return null;

    await redis.del(`saml:request:${requestId}`);
    return storeId;
  },
};

// SSO credentials helper (for temporary token-based flow)
export const ssoCredentials = {
  /**
   * Store SSO credentials temporarily with a token
   * TTL: 5 minutes (one-time use)
   */
  async set(token: string, credentials: { email: string; password: string; returnTo: string }): Promise<void> {
    await redis.setex(`sso:creds:${token}`, 300, JSON.stringify(credentials));
  },

  /**
   * Get and delete credentials (one-time use)
   */
  async consume(token: string): Promise<{ email: string; password: string; returnTo: string } | null> {
    const data = await redis.get(`sso:creds:${token}`);
    if (!data) return null;

    await redis.del(`sso:creds:${token}`);
    return JSON.parse(data);
  },
};

// OTP helper (for email verification)
export const ssoOtp = {
  /**
   * Store OTP code for email verification
   * TTL: 10 minutes (one-time use)
   */
  async set(email: string, otp: string, data: { storeId: string; customerId?: string; returnTo?: string }): Promise<void> {
    const key = `sso:otp:${email.toLowerCase()}`;
    await redis.setex(key, 600, JSON.stringify({ otp, ...data, createdAt: Date.now() }));
  },

  /**
   * Verify and consume OTP (one-time use)
   */
  async verify(email: string, otp: string): Promise<{ storeId: string; customerId?: string; returnTo?: string } | null> {
    const key = `sso:otp:${email.toLowerCase()}`;
    const data = await redis.get(key);
    
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    
    // Verify OTP matches
    if (parsed.otp !== otp) {
      return null;
    }
    
    // Consume OTP (delete after use)
    await redis.del(key);
    
    return {
      storeId: parsed.storeId,
      customerId: parsed.customerId,
      returnTo: parsed.returnTo,
    };
  },

  /**
   * Get OTP data without consuming (for checking if OTP exists)
   */
  async get(email: string): Promise<{ otp: string; storeId: string; customerId?: string; returnTo?: string } | null> {
    const key = `sso:otp:${email.toLowerCase()}`;
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data);
  },
};

// Rate limiting helper
export const rateLimit = {
  async check(key: string, limit: number, windowSec: number): Promise<boolean> {
    const current = await redis.incr(`rate:${key}`);
    if (current === 1) {
      await redis.expire(`rate:${key}`, windowSec);
    }
    return current <= limit;
  },
};

// Graceful shutdown
process.on('beforeExit', async () => {
  await redis.quit();
});
