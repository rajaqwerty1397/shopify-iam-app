import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { storesService } from '../stores/stores.service.js';
import { authService } from '../auth/auth.service.js';
import { ssoProvidersService } from '../sso-providers/sso-providers.service.js';
import { config } from '../../config/index.js';
import { ssoCredentials } from '../../lib/redis.js';

/**
 * Config Routes - Used by storefront theme extension and Shopify App Proxy
 * Mounted at /api/proxy (Shopify forwards /apps/sso/* to here)
 */
const configRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * GET /config
   * Returns SSO button configuration for the storefront
   */
  fastify.get(
    '/config',
    {
      schema: {
        tags: ['Config'],
        summary: 'Get SSO button configuration',
        querystring: {
          type: 'object',
          properties: {
            shop: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { shop } = request.query as { shop?: string };

      // Default config
      let buttonConfig = {
        enableSso: true,
        ssoText: 'Sign in with SSO',
        enableGoogle: false,
        enableMicrosoft: false,
        buttonColor: '#000000',
        providers: [] as Array<{ id: string; name: string; type: string; icon?: string }>,
      };

      if (shop) {
        try {
          const store = await storesService.findByDomain(shop);
          if (store) {
            // Get all active providers for this store
            const providers = await ssoProvidersService.getStoreProviders(store.id);
            buttonConfig.providers = providers.map(p => ({
              id: p.id,
              name: p.displayName,
              type: p.providerType,
              icon: p.iconUrl || undefined,
            }));

            if (store.metadata && typeof store.metadata === 'object') {
              const meta = store.metadata as Record<string, any>;
              buttonConfig = {
                ...buttonConfig,
                enableSso: meta.ssoButtonSettings?.enableSso ?? true,
                ssoText: meta.ssoButtonSettings?.ssoText ?? 'Sign in with SSO',
                enableGoogle: providers.some(p => p.providerType === 'google'),
                enableMicrosoft: providers.some(p => p.providerType === 'microsoft'),
                buttonColor: meta.ssoButtonSettings?.buttonColor ?? '#000000',
              };
            }
          }
        } catch {
          // Store not found, use defaults
        }
      }

      // Set CORS headers for storefront access
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET');

      return reply.send(buttonConfig);
    }
  );

  /**
   * GET /providers
   * Returns list of configured SSO providers for a store
   */
  fastify.get(
    '/providers',
    {
      schema: {
        tags: ['Config'],
        summary: 'Get configured SSO providers',
        querystring: {
          type: 'object',
          properties: {
            shop: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { shop } = request.query as { shop?: string };

      if (!shop) {
        return reply.status(400).send({ error: 'Shop domain is required' });
      }

      try {
        const store = await storesService.findByDomain(shop);
        if (!store) {
          return reply.status(404).send({ error: 'Store not found' });
        }

        const providers = await ssoProvidersService.getStoreProviders(store.id);

        return reply.send({
          providers: providers.map(p => ({
            id: p.id,
            name: p.displayName,
            type: p.providerType,
            protocol: p.protocol,
            icon: p.iconUrl,
          })),
        });
      } catch (error) {
        return reply.status(500).send({ error: 'Failed to fetch providers' });
      }
    }
  );

  /**
   * GET /login
   * Shows SSO login page with provider buttons or redirects directly if only one provider
   */
  fastify.get(
    '/login',
    {
      schema: {
        tags: ['Config'],
        summary: 'SSO login page',
        querystring: {
          type: 'object',
          properties: {
            shop: { type: 'string' },
            return_to: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { shop, return_to } = request.query as { shop?: string; return_to?: string };

      if (!shop) {
        return reply.redirect(302, `${config.app.url}/error?error=missing_shop`);
      }

      try {
        // Find store by domain
        const store = await storesService.findByDomain(shop);
        if (!store) {
          return reply.redirect(302, `${config.app.url}/error?error=store_not_found`);
        }

        // Get all active SSO providers for this store
        const providers = await ssoProvidersService.getStoreProviders(store.id);

        if (providers.length === 0) {
          return reply.redirect(302, `${config.app.url}/error?error=no_sso_provider`);
        }

        // If only one provider, redirect directly to it
        if (providers.length === 1) {
          const result = await authService.initiateLogin(store.id, providers[0].providerType, return_to);
          return reply.redirect(302, result.redirectUrl);
        }

        // Multiple providers - show selection page
        const providerButtons = providers.map(p => {
          const buttonStyle = getButtonStyleForProvider(p.providerType);
          return `
            <a href="/apps/sso/auth/${p.providerType}?shop=${encodeURIComponent(shop)}&return_to=${encodeURIComponent(return_to || '')}"
               class="sso-button"
               style="background-color: ${buttonStyle.bg}; color: ${buttonStyle.color};">
              ${buttonStyle.icon ? `<span class="icon">${buttonStyle.icon}</span>` : ''}
              <span>Continue with ${p.displayName}</span>
            </a>
          `;
        }).join('\n');

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In - ${store.name || shop}</title>
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
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      padding: 40px;
      max-width: 400px;
      width: 100%;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 8px;
      color: #1a1a1a;
    }
    .subtitle {
      color: #666;
      margin-bottom: 32px;
    }
    .sso-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      padding: 14px 20px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      margin-bottom: 12px;
    }
    .sso-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .icon { font-size: 20px; }
    .divider {
      display: flex;
      align-items: center;
      margin: 24px 0;
      color: #999;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid #e0e0e0;
    }
    .divider span { padding: 0 16px; font-size: 14px; }
    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 14px;
      color: #666;
    }
    .footer a { color: #667eea; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Welcome back</h1>
    <p class="subtitle">Sign in to continue to ${store.name || shop}</p>

    ${providerButtons}

    <div class="footer">
      <p>Protected by SSO</p>
    </div>
  </div>
</body>
</html>`;

        return reply.type('text/html').send(html);
      } catch (error) {
        request.log.error(error, 'SSO login error');
        return reply.redirect(302, `${config.app.url}/error?error=login_failed`);
      }
    }
  );

  /**
   * GET /auth/:provider
   * Initiates OAuth login for specific provider
   */
  fastify.get(
    '/auth/:provider',
    {
      schema: {
        tags: ['Config'],
        summary: 'Initiate OAuth login for specific provider',
        params: {
          type: 'object',
          required: ['provider'],
          properties: {
            provider: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            shop: { type: 'string' },
            return_to: { type: 'string' },
            popup: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { provider } = request.params as { provider: string };
      const { shop, return_to, popup } = request.query as { shop?: string; return_to?: string; popup?: string };

      if (!shop) {
        return reply.status(400).send({ error: 'missing_shop', message: 'Shop parameter is required' });
      }

      try {
        // Find store by domain
        const store = await storesService.findByDomain(shop);
        if (!store) {
          return reply.status(404).send({ error: 'store_not_found', message: `Store ${shop} not found` });
        }

        // Check if store has valid credentials
        if (store.status === 'uninstalled') {
          return reply.status(403).send({ error: 'store_uninstalled', message: 'Store app is not installed' });
        }

        // Initiate login with specific provider
        // Pass popup flag in returnTo so we can handle it in callback
        const returnToWithPopup = popup === 'true' 
          ? `${return_to || '/account'}|popup=true`
          : return_to;
        
        const result = await authService.initiateLogin(store.id, provider, returnToWithPopup);
        return reply.redirect(302, result.redirectUrl);
      } catch (error) {
        request.log.error(error, `${provider} login error`);
        const errorMsg = error instanceof Error ? error.message : 'login_failed';
        return reply.status(500).send({
          error: 'login_failed',
          message: errorMsg
        });
      }
    }
  );

  /**
   * GET /credentials
   * Retrieve SSO credentials by token (one-time use)
   * Accessed via app proxy: /apps/sso/credentials
   */
  fastify.get(
    '/credentials',
    {
      schema: {
        tags: ['Config'],
        summary: 'Get SSO credentials by token',
        querystring: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const query = request.query as { token?: string };
      const token = query.token;

      if (!token || token.trim() === '') {
        return reply.code(400).send({ error: 'Token is required' });
      }

      // Consume token (one-time use)
      const credentials = await ssoCredentials.consume(token);

      if (!credentials) {
        return reply.code(404).send({ error: 'Invalid or expired token' });
      }

      return reply.send({
        email: credentials.email,
        password: credentials.password,
        returnTo: credentials.returnTo,
      });
    }
  );
};

/**
 * Get button style for provider type
 */
function getButtonStyleForProvider(providerType: string): { bg: string; color: string; icon?: string } {
  const styles: Record<string, { bg: string; color: string; icon?: string }> = {
    google: { bg: '#ffffff', color: '#1a1a1a', icon: '🔴' },
    microsoft: { bg: '#2f2f2f', color: '#ffffff', icon: '🔷' },
    facebook: { bg: '#1877f2', color: '#ffffff', icon: '🔵' },
    auth0: { bg: '#eb5424', color: '#ffffff', icon: '🔐' },
    okta: { bg: '#007dc1', color: '#ffffff', icon: '🔒' },
    azure: { bg: '#0078d4', color: '#ffffff', icon: '☁️' },
    custom: { bg: '#6c757d', color: '#ffffff', icon: '⚙️' },
    custom_oauth: { bg: '#6c757d', color: '#ffffff', icon: '⚙️' },
  };

  return styles[providerType] || { bg: '#333333', color: '#ffffff' };
}

export default configRoutes;
