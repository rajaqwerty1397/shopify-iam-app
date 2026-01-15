import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_URL: z.string().url(),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // Encryption
  ENCRYPTION_KEY: z.string().min(64), // 32 bytes = 64 hex chars
  PASSWORD_PEPPER: z.string().min(16),

  // Shopify
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SHOPIFY_SCOPES: z.string().default('read_customers,write_customers'),
  SHOPIFY_APP_URL: z.string().url(),
  SHOPIFY_APP_HANDLE: z.string().min(1),
  
  // OAuth Callback URL (optional - defaults to SHOPIFY_APP_URL)
  OAUTH_CALLBACK_URL: z.string().url().optional(),

  // Session
  SESSION_SECRET: z.string().min(32),
  COOKIE_DOMAIN: z.string().optional(),

  // Security
  CORS_ORIGINS: z.string().optional(),
  RATE_LIMIT_MAX: z.string().transform(Number).default('100'),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),

  // OAuth Providers (optional defaults)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),

  // Email (SendGrid SMTP)
  MAIL_MAILER: z.string().default('smtp'),
  MAIL_HOST: z.string().default('smtp.sendgrid.net'),
  MAIL_PORT: z.string().transform(Number).default('2525'),
  MAIL_USERNAME: z.string().default('apikey'),
  MAIL_PASSWORD: z.string().min(1),
  MAIL_ENCRYPTION: z.string().nullable().default(null),
  MAIL_FROM_ADDRESS: z.string().email(),
  MAIL_FROM_NAME: z.string().default('Alintro Support'),
});

// Parse and validate environment
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parseResult.error.format());
  process.exit(1);
}

const env = parseResult.data;

// Export configuration object
export const config = {
  env: env.NODE_ENV,
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  server: {
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
  },

  app: {
    url: env.APP_URL,
    name: 'Persona SSO',
    version: '1.0.0',
  },

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  encryption: {
    key: env.ENCRYPTION_KEY,
    pepper: env.PASSWORD_PEPPER,
  },

  shopify: {
    apiKey: env.SHOPIFY_API_KEY,
    apiSecret: env.SHOPIFY_API_SECRET,
    scopes: env.SHOPIFY_SCOPES.split(','),
    appUrl: env.SHOPIFY_APP_URL,
    appHandle: env.SHOPIFY_APP_HANDLE,
  },
  
  // OAuth callback base URL - defaults to SHOPIFY_APP_URL if not specified
  // Use this for OAuth provider callbacks (Google, Auth0, etc.)
  oauth: {
    callbackBaseUrl: env.OAUTH_CALLBACK_URL || env.SHOPIFY_APP_URL,
  },

  session: {
    secret: env.SESSION_SECRET,
    cookieDomain: env.COOKIE_DOMAIN,
  },

  security: {
    corsOrigins: env.CORS_ORIGINS?.split(',') || [],
    rateLimit: {
      max: env.RATE_LIMIT_MAX,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
    },
  },

  providers: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
    },
    facebook: {
      clientId: env.FACEBOOK_CLIENT_ID,
      clientSecret: env.FACEBOOK_CLIENT_SECRET,
    },
  },

  email: {
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    username: env.MAIL_USERNAME,
    password: env.MAIL_PASSWORD,
    encryption: env.MAIL_ENCRYPTION,
    fromAddress: env.MAIL_FROM_ADDRESS,
    fromName: env.MAIL_FROM_NAME,
  },
} as const;


export type Config = typeof config;
