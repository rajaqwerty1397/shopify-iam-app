import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { shopifyOAuthService } from './shopify-oauth.service.js';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../lib/logger.js';

const logger = createModuleLogger('ShopifyOAuthRoutes');

/**
 * Shopify OAuth Routes
 *
 * Handles Shopify app installation and webhooks:
 * - GET /api/shopify/auth - Start OAuth flow
 * - GET /api/shopify/auth/callback - Handle OAuth callback
 * - POST /api/shopify/webhooks - Handle Shopify webhooks
 */
const shopifyOAuthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * @swagger
   * /api/shopify/auth:
   *   get:
   *     summary: Start Shopify OAuth flow
   *     tags: [Shopify]
   *     description: Initiates the OAuth authorization flow for app installation
   *     parameters:
   *       - in: query
   *         name: shop
   *         required: true
   *         schema:
   *           type: string
   *         description: Shopify store domain (e.g., store.myshopify.com)
   *     responses:
   *       302:
   *         description: Redirect to Shopify OAuth authorization page
   *       400:
   *         description: Invalid shop parameter
   */
  fastify.get(
    '/auth',
    {
      schema: {
        tags: ['Shopify'],
        summary: 'Start Shopify OAuth flow',
        querystring: {
          type: 'object',
          required: ['shop'],
          properties: {
            shop: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      let { shop } = request.query as { shop: string };

      if (!shop) {
        return reply.status(400).send({
          error: 'missing_shop',
          message: 'Shop parameter is required.',
        });
      }

      // Normalize shop domain - handle various input formats
      shop = shop.trim().toLowerCase();
      
      // Remove protocol (https://, http://)
      shop = shop.replace(/^https?:\/\//, '');
      
      // Remove trailing slash and path
      shop = shop.split('/')[0]!;
      
      // Remove www. prefix if present
      shop = shop.replace(/^www\./, '');
      
      // Add .myshopify.com if missing
      if (!shop.endsWith('.myshopify.com')) {
        shop = `${shop}.myshopify.com`;
      }

      // Validate final shop domain
      if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
        return reply.status(400).send({
          error: 'invalid_shop',
          message: 'Invalid shop domain. Must be a valid .myshopify.com domain.',
        });
      }

      // Generate state for CSRF protection
      const state = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Store state in cookie for verification
      reply.setCookie('shopify_oauth_state', state, {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
        path: '/',
      });

      // Generate OAuth URL and redirect
      const authUrl = shopifyOAuthService.generateAuthUrl(shop, state);

      logger.info({ shop }, 'Starting Shopify OAuth flow');

      return reply.redirect(302, authUrl);
    }
  );

  /**
   * @swagger
   * /api/shopify/auth/callback:
   *   get:
   *     summary: Handle Shopify OAuth callback
   *     tags: [Shopify]
   *     description: Handles the OAuth callback from Shopify after merchant authorization
   *     parameters:
   *       - in: query
   *         name: shop
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: code
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: hmac
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: state
   *         schema:
   *           type: string
   *       - in: query
   *         name: timestamp
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       302:
   *         description: Redirect to app dashboard on success
   *       400:
   *         description: Invalid request or HMAC verification failed
   */
  fastify.get(
    '/auth/callback',
    {
      schema: {
        tags: ['Shopify'],
        summary: 'Handle Shopify OAuth callback',
        querystring: {
          type: 'object',
          required: ['shop', 'code', 'hmac', 'timestamp'],
          properties: {
            shop: { type: 'string' },
            code: { type: 'string' },
            hmac: { type: 'string' },
            state: { type: 'string' },
            timestamp: { type: 'string' },
            host: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const query = request.query as Record<string, string>;
      const { shop, code, state } = query;

      try {
        // 1. Verify HMAC signature
        if (!shopifyOAuthService.verifyHmac(query)) {
          logger.warn({ shop }, 'HMAC verification failed');
          return reply.redirect(302, `${config.app.url}/error?error=invalid_hmac`);
        }

        // 2. Verify state (CSRF protection) - optional but recommended
        const storedState = request.cookies.shopify_oauth_state;
        if (storedState && state && storedState !== state) {
          logger.warn({ shop }, 'State mismatch - possible CSRF attack');
          return reply.redirect(302, `${config.app.url}/error?error=invalid_state`);
        }

        // Clear the state cookie
        reply.clearCookie('shopify_oauth_state', { path: '/' });

        // 3. Install the store
        logger.info({ shop, codeLength: code?.length }, 'Starting store installation from OAuth callback');
        
        const result = await shopifyOAuthService.installStore(shop, code);

        logger.info(
          {
            storeId: result.storeId,
            shop: result.domain,
            planId: result.planId,
            isPlus: result.isPlus,
          },
          'Store installed successfully - redirecting to dashboard'
        );

        // 4. Redirect to app dashboard
        return reply.redirect(302, result.redirectUrl);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        logger.error({ 
          error: errorMessage,
          stack: errorStack,
          shop,
          code: code?.substring(0, 10) + '...',
        }, 'OAuth callback failed - DETAILED ERROR');
        
        // Return error page with details in dev mode
        if (config.isDev) {
          return reply.status(500).send({
            error: 'installation_failed',
            message: errorMessage,
            shop,
            details: errorStack,
          });
        }
        
        return reply.redirect(302, `${config.app.url}/error?error=installation_failed&shop=${encodeURIComponent(shop)}`);
      }
    }
  );

  /**
   * @swagger
   * /api/shopify/webhooks:
   *   post:
   *     summary: Handle Shopify webhooks
   *     tags: [Shopify]
   *     description: Handles various Shopify webhooks (app/uninstalled, GDPR, etc.)
   *     responses:
   *       200:
   *         description: Webhook processed successfully
   *       401:
   *         description: Invalid webhook signature
   */
  fastify.post(
    '/webhooks',
    {
      schema: {
        tags: ['Shopify'],
        summary: 'Handle Shopify webhooks',
      },
      config: {
        rawBody: true, // Need raw body for HMAC verification
      },
    },
    async (request, reply) => {
      const hmacHeader = request.headers['x-shopify-hmac-sha256'] as string;
      const topic = request.headers['x-shopify-topic'] as string;
      const shopDomain = request.headers['x-shopify-shop-domain'] as string;

      logger.info({ topic, shopDomain, hasHmac: !!hmacHeader }, 'Received Shopify webhook');

      // Get raw body for HMAC verification
      // Fastify stores raw body in request.rawBody if configured, otherwise we need to reconstruct it
      let rawBody: string;
      if ((request as any).rawBody) {
        rawBody = (request as any).rawBody;
      } else if (request.body) {
        // Fallback: stringify the body (less secure but works if rawBody not available)
        rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        logger.warn({ shopDomain }, 'Using stringified body for HMAC - rawBody not available');
      } else {
        logger.error({ shopDomain }, 'No body available for HMAC verification');
        return reply.status(400).send({ error: 'Missing body' });
      }

      // Verify webhook signature - CRITICAL for security
      if (!hmacHeader) {
        logger.warn({ topic, shopDomain }, 'Missing HMAC header');
        return reply.status(401).send({ error: 'Missing HMAC header' });
      }

      if (!shopifyOAuthService.verifyWebhookSignature(rawBody, hmacHeader)) {
        logger.warn({ topic, shopDomain, hmacHeader: hmacHeader.substring(0, 20) + '...' }, 'Invalid webhook signature - REJECTED');
        return reply.status(401).send({ error: 'Invalid signature' });
      }

      logger.info({ topic, shopDomain, bodyLength: rawBody.length }, 'Webhook signature verified - processing');

      try {
        switch (topic) {
          case 'app/uninstalled':
            await shopifyOAuthService.handleUninstall(shopDomain);
            break;

          case 'customers/data_request':
            // GDPR: Customer data request - return customer data
            logger.info({ shopDomain }, 'Customer data request webhook');
            // Implementation depends on your data retention policy
            break;

          case 'customers/redact':
            // GDPR: Customer data deletion request
            logger.info({ shopDomain }, 'Customer redact webhook');
            // Delete customer data from your database
            break;

          case 'shop/redact':
            // GDPR: Shop data deletion request
            logger.info({ shopDomain }, 'Shop redact webhook');
            // Delete all shop data from your database
            break;

          default:
            logger.info({ topic, shopDomain }, 'Unhandled webhook topic');
        }

        return reply.status(200).send({ success: true });
      } catch (error) {
        logger.error({ error, topic, shopDomain }, 'Webhook processing failed');
        return reply.status(500).send({ error: 'Webhook processing failed' });
      }
    }
  );

  /**
   * @swagger
   * /api/shopify/install:
   *   get:
   *     summary: App install landing page
   *     tags: [Shopify]
   *     description: Landing page for app installation, shows install button
   *     responses:
   *       200:
   *         description: HTML page with install form
   */
  fastify.get(
    '/install',
    {
      schema: {
        tags: ['Shopify'],
        summary: 'App install landing page',
      },
    },
    async (request, reply) => {
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Install ${config.app.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px;
      max-width: 450px;
      width: 100%;
      text-align: center;
    }
    .logo {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 20px;
      margin: 0 auto 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      color: white;
    }
    h1 { font-size: 24px; margin-bottom: 12px; color: #1a1a2e; }
    p { color: #666; margin-bottom: 24px; line-height: 1.6; }
    .form-group { margin-bottom: 20px; text-align: left; }
    label { display: block; margin-bottom: 8px; font-weight: 500; color: #333; }
    input {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s;
    }
    input:focus { outline: none; border-color: #667eea; }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }
    .features { margin-top: 32px; text-align: left; }
    .features h3 { font-size: 14px; color: #999; margin-bottom: 12px; text-transform: uppercase; }
    .feature {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      color: #333;
    }
    .feature-icon { color: #667eea; font-size: 18px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">🔐</div>
    <h1>${config.app.name}</h1>
    <p>Enterprise Single Sign-On for your Shopify store. Let customers login with Google, Microsoft, and more.</p>
    
    <form action="${config.app.url}/api/shopify/auth" method="GET">
      <div class="form-group">
        <label for="shop">Your Shopify Store URL</label>
        <input type="text" id="shop" name="shop" placeholder="your-store.myshopify.com" required pattern="[a-zA-Z0-9][a-zA-Z0-9-]*\\.myshopify\\.com" />
      </div>
      <button type="submit">Install App</button>
    </form>

    <div class="features">
      <h3>What you get</h3>
      <div class="feature">
        <span class="feature-icon">✓</span>
        <span>Google, Microsoft, Facebook SSO</span>
      </div>
      <div class="feature">
        <span class="feature-icon">✓</span>
        <span>SAML 2.0 for enterprise IdPs</span>
      </div>
      <div class="feature">
        <span class="feature-icon">✓</span>
        <span>Multipass support for Plus stores</span>
      </div>
      <div class="feature">
        <span class="feature-icon">✓</span>
        <span>Free plan with 100 users</span>
      </div>
    </div>
  </div>
</body>
</html>`;

      return reply.type('text/html').send(html);
    }
  );
};

export default shopifyOAuthRoutes;
