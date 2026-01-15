import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { config } from './config/index.js';
import { swaggerConfig, swaggerUiConfig } from './config/swagger.js';
import { logger } from './lib/logger.js';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';

// Plugins
import errorHandler from './plugins/error-handler.js';
import prismaPlugin from './plugins/prisma.js';

// Routes
import platformsRoutes from './modules/platforms/platforms.routes.js';
import applicationsRoutes from './modules/applications/applications.routes.js';
import plansRoutes from './modules/plans/plans.routes.js';
import storesRoutes from './modules/stores/stores.routes.js';
import ssoProvidersRoutes from './modules/sso-providers/sso-providers.routes.js';
import ssoUsersRoutes from './modules/sso-users/sso-users.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import shopifyOAuthRoutes from './modules/shopify/shopify-oauth.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import onboardingRoutes from './modules/onboarding/onboarding.routes.js';
import billingRoutes from './modules/billing/billing.routes.js';
import insightsRoutes from './modules/insights/insights.routes.js';
import configRoutes from './modules/config/config.routes.js';

/**
 * Build Fastify Application
 */
async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.server.logLevel,
      ...(config.isDev && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
    },
    trustProxy: true,
  });

  // Register security plugins
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disabled for Swagger UI compatibility
    crossOriginEmbedderPolicy: false, // Allow embedding
    frameguard: false, // Disable X-Frame-Options to allow Shopify iframe embedding
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }

      // Allow Shopify storefront and admin origins
      const allowedPatterns = [
        /^https?:\/\/.*\.myshopify\.com$/,
        /^https?:\/\/.*\.shopify\.com$/,
        /^https?:\/\/admin\.shopify\.com$/,
        /^https?:\/\/.*\.spin\.dev$/,
      ];

      // Check if origin matches any allowed pattern
      const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
      if (isAllowed) {
        return callback(null, true);
      }
      
      // Log blocked origins for debugging
      logger.warn({ origin }, 'CORS: Blocked origin');
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Shop-Domain',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Request-ID',
    ],
    exposedHeaders: ['Content-Type', 'Authorization'],
    preflight: true, // Explicitly enable preflight handling
    preflightContinue: false,
  });

  // Add hook to remove X-Frame-Options and set CSP for Shopify embedding
  app.addHook('onSend', async (request, reply) => {
    reply.removeHeader('X-Frame-Options');
    reply.header(
      'Content-Security-Policy',
      "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.spin.dev;"
    );
  });

  await app.register(rateLimit, {
    max: config.security.rateLimit.max,
    timeWindow: config.security.rateLimit.windowMs,
    skipOnError: true,
  });

  // Register utility plugins
  await app.register(formbody);
  
  // Handle empty body with application/json content-type
  // This fixes "Body cannot be empty when content-type is set to 'application/json'" error
  app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
    try {
      // Store raw body for webhook HMAC verification (Shopify webhooks need raw body)
      (req as any).rawBody = body;
      
      // Handle empty body - return empty object
      if (!body || (typeof body === 'string' && body.length === 0)) {
        done(null, {});
        return;
      }
      // Parse JSON normally
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });
  
  await app.register(cookie, {
    secret: config.session.secret,
  });

  // Register Swagger documentation
  await app.register(swagger, swaggerConfig);
  await app.register(swaggerUi, swaggerUiConfig);

  // Register custom plugins
  await app.register(errorHandler);
  await app.register(prismaPlugin);

  // Health check endpoints
  app.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Health check',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' },
          },
        },
      },
    },
  }, async () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: config.app.version,
  }));

  app.get('/health/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness check',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            database: { type: 'string' },
            redis: { type: 'string' },
          },
        },
      },
    },
  }, async () => {
    // Check database
    let dbStatus = 'healthy';
    try {
      await app.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'unhealthy';
    }

    // Check Redis
    let redisStatus = 'healthy';
    try {
      await redis.ping();
    } catch {
      redisStatus = 'unhealthy';
    }

    const isHealthy = dbStatus === 'healthy' && redisStatus === 'healthy';

    return {
      status: isHealthy ? 'ready' : 'not_ready',
      database: dbStatus,
      redis: redisStatus,
    };
  });

  // Register API routes
  await app.register(platformsRoutes, { prefix: '/api/platforms' });
  await app.register(applicationsRoutes, { prefix: '/api/applications' });
  await app.register(plansRoutes, { prefix: '/api/plans' });
  await app.register(storesRoutes, { prefix: '/api/stores' });
  await app.register(ssoProvidersRoutes, { prefix: '/api/providers' });
  await app.register(ssoUsersRoutes, { prefix: '/api/users' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(shopifyOAuthRoutes, { prefix: '/api/shopify' });
  
  // Frontend-facing routes
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(onboardingRoutes, { prefix: '/api/onboarding' });
  await app.register(billingRoutes, { prefix: '/api/billing' });
  await app.register(insightsRoutes, { prefix: '/api/insights' });

  // Also register settings under root /api
  await app.register(onboardingRoutes, { prefix: '/api' }); // For /api/settings

  // Storefront config endpoint (for app proxy)
  // Register at multiple paths to handle different routing scenarios:
  // 1. /api/proxy/* - for when app proxy transforms the path
  // 2. /api/proxy/sso/* - for when app proxy adds subpath (Shopify app proxy with subpath="sso")
  // 3. /apps/sso/* - for direct requests or when path isn't transformed
  // 4. /api/public/* - PUBLIC endpoint that bypasses app proxy (works with password protection)
  await app.register(configRoutes, { prefix: '/api/proxy' });
  await app.register(configRoutes, { prefix: '/api/proxy/sso' }); // Handle app proxy subpath
  await app.register(configRoutes, { prefix: '/apps/sso' });
  await app.register(configRoutes, { prefix: '/api/public' }); // Public endpoint - no app proxy needed

  return app;
}

/**
 * Test database connection
 */
async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✓ Database connection successful');
    return true;
  } catch (error) {
    logger.error({ error }, '✗ Database connection failed');
    logger.error('Please check:');
    logger.error('  1. PostgreSQL is running');
    logger.error('  2. DATABASE_URL in .env is correct');
    logger.error('  3. Database exists and migrations are run');
    return false;
  }
}

/**
 * Test Redis connection
 */
async function testRedisConnection(): Promise<boolean> {
  try {
    // Check if already connected
    if (redis.status === 'ready') {
      await redis.ping();
      logger.info('✓ Redis connection successful (already connected)');
      return true;
    }
    
    // Try to connect
    await redis.connect();
    await redis.ping();
    logger.info('✓ Redis connection successful');
    return true;
  } catch (error) {
    logger.error({ error }, '✗ Redis connection failed');
    logger.error('Please check:');
    logger.error('  1. Redis is running');
    logger.error('  2. REDIS_URL in .env is correct');
    logger.error('  3. Redis is accessible from this machine');
    return false;
  }
}

/**
 * Start Server
 */
async function start() {
  try {
    logger.info('Starting Persona SSO server...');
    
    // Test database connection first
    logger.info('Testing database connection...');
    let dbConnected = false;
    try {
      dbConnected = await testDatabaseConnection();
    } catch (error) {
      logger.fatal({ error }, 'Database connection test failed');
      logger.fatal('This might be because:');
      logger.fatal('  1. Prisma Client is not generated - run: npm run db:generate');
      logger.fatal('  2. Database is not running or DATABASE_URL is incorrect');
      logger.fatal('  3. Database migrations are not run - run: npm run db:migrate');
      process.exit(1);
    }
    
    if (!dbConnected) {
      logger.fatal('Cannot start server without database connection');
      process.exit(1);
    }

    // Test Redis connection
    logger.info('Testing Redis connection...');
    const redisConnected = await testRedisConnection();
    if (!redisConnected) {
      logger.warn('Redis connection failed - some features may not work');
      logger.warn('Server will start but SSO state management may be affected');
    }

    // Build app after connections are verified
    const app = await buildApp();

    // Start server
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info(
      {
        port: config.server.port,
        host: config.server.host,
        env: config.env,
        docs: `http://localhost:${config.server.port}/docs`,
        database: dbConnected ? 'connected' : 'disconnected',
        redis: redisConnected ? 'connected' : 'disconnected',
      },
      '🚀 Persona SSO server started'
    );
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the application
start();
