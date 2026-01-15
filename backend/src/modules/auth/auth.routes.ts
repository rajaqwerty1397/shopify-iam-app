import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { authService } from './auth.service.js';
import { getSupportedProviders } from './providers/index.js';
import { ssoProvidersService } from '../sso-providers/sso-providers.service.js';
import { encryptionService } from '../../services/encryption.service.js';
import { config } from '../../config/index.js';
import { ssoState, ssoCredentials, ssoOtp } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import { createShopifyService } from '../../services/shopify.service.js';
import { emailService } from '../../services/email.service.js';
import { encryptionService } from '../../services/encryption.service.js';
import { generateOtp } from '../../utils/otp.util.js';
import { passwordService } from '../../services/password.service.js';

/**
 * Generate HTML page for test connection results
 */
function generateTestResultHtml(result: {
  success: boolean;
  message?: string;
  error?: string;
  provider?: string;
  details?: Record<string, unknown>;
}): string {
  const statusColor = result.success ? '#22c55e' : '#ef4444';
  const statusIcon = result.success ? '✓' : '✗';
  const statusText = result.success ? 'Success' : 'Failed';

  let detailsHtml = '';
  if (result.details) {
    detailsHtml = '<div style="margin-top: 16px; padding: 12px; background: #f5f5f5; border-radius: 8px; text-align: left;">';
    detailsHtml += '<strong style="display: block; margin-bottom: 8px;">Details:</strong>';
    detailsHtml += '<pre style="margin: 0; font-size: 12px; overflow-x: auto;">' +
      JSON.stringify(result.details, null, 2) + '</pre>';
    detailsHtml += '</div>';
  }

  return `<!DOCTYPE html>
<html>
<head>
  <title>SSO Test Result</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f9fafb;
    }
    .container {
      background: white;
      padding: 32px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-width: 500px;
      width: 90%;
      text-align: center;
    }
    .status-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: ${statusColor};
      color: white;
      font-size: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
    }
    .status-text {
      font-size: 24px;
      font-weight: 600;
      color: ${statusColor};
      margin-bottom: 8px;
    }
    .provider-name {
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 16px;
    }
    .message {
      color: #374151;
      font-size: 16px;
      line-height: 1.5;
    }
    .close-btn {
      margin-top: 24px;
      padding: 12px 24px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    .close-btn:hover {
      background: #2563eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="status-icon">${statusIcon}</div>
    <div class="status-text">${statusText}</div>
    ${result.provider ? `<div class="provider-name">${result.provider}</div>` : ''}
    <div class="message">${result.message || result.error || ''}</div>
    ${detailsHtml}
    <button class="close-btn" onclick="window.close()">Close Window</button>
  </div>
  <script>
    // Notify parent window of result
    if (window.opener) {
      try {
        window.opener.postMessage({
          type: 'sso-test-result',
          success: ${result.success},
          message: ${JSON.stringify(result.message || result.error || '')},
          details: ${JSON.stringify(result.details || {})}
        }, '*');
      } catch (e) {
        console.error('Failed to send message to parent:', e);
      }
    }
    
    // Also try to close after a short delay if opened as popup
    if (window.opener) {
      setTimeout(function() {
        // Don't auto-close, let user close manually
      }, 100);
    }
  </script>
</body>
</html>`;
}

/**
 * Auth Routes
 *
 * Handles SSO authentication flows for both OIDC and SAML.
 */
const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * Get available SSO providers for a store
   * GET /api/auth/providers/:storeId
   */
  fastify.get(
    '/providers/:storeId',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Get available SSO providers for a store',
        params: {
          type: 'object',
          required: ['storeId'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                providerType: { type: 'string' },
                protocol: { type: 'string', enum: ['oidc', 'saml'] },
                displayName: { type: 'string' },
                iconUrl: { type: 'string', nullable: true },
                displayOrder: { type: 'integer' },
                buttonStyle: { type: 'object', nullable: true },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const providers = await ssoProvidersService.getStoreProviders(storeId);
      return reply.send(providers);
    }
  );

  /**
   * Get list of all supported provider types
   * GET /api/auth/supported-providers
   */
  fastify.get(
    '/supported-providers',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Get list of supported SSO provider types',
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                protocol: { type: 'string', enum: ['oidc', 'saml'] },
                name: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const providers = getSupportedProviders();
      return reply.send(providers);
    }
  );

  /**
   * Initiate SSO login
   * GET /api/auth/:storeId/:providerType/login
   */
  fastify.get(
    '/:storeId/:providerType/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Initiate SSO login flow',
        description: 'Redirects user to the identity provider for authentication',
        params: {
          type: 'object',
          required: ['storeId', 'providerType'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
            providerType: { type: 'string', description: 'Provider type (google, microsoft, okta, etc.)' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            returnTo: { type: 'string', description: 'URL to redirect after successful login' },
          },
        },
        response: {
          302: {
            type: 'null',
            description: 'Redirect to identity provider',
          },
        },
      },
    },
    async (request, reply) => {
      const { storeId, providerType } = request.params as { storeId: string; providerType: string };
      const { returnTo } = request.query as { returnTo?: string };

      const result = await authService.initiateLogin(storeId, providerType, returnTo);

      return reply.redirect(302, result.redirectUrl);
    }
  );

  /**
   * OIDC Callback
   * GET/POST /api/auth/oidc/:providerType/callback
   * 
   * Note: OAuth providers typically use GET, but we support both for compatibility
   */
  fastify.route({
    method: ['GET', 'POST'],
    url: '/oidc/:providerType/callback',
    schema: {
      tags: ['Auth'],
      summary: 'OIDC callback endpoint',
      description: 'Handles the callback from OIDC providers',
      params: {
        type: 'object',
        required: ['providerType'],
        properties: {
          providerType: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          state: { type: 'string' },
          error: { type: 'string' },
          error_description: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      // OAuth callbacks can send parameters in query string (GET) or body (POST)
      // Get from query string first, fallback to body for POST requests
      const queryParams = request.query as Record<string, string | undefined>;
      const bodyParams = (request.body as Record<string, string | undefined>) || {};
      
      const query = {
        code: queryParams.code || bodyParams.code,
        state: queryParams.state || bodyParams.state,
        error: queryParams.error || bodyParams.error,
        error_description: queryParams.error_description || bodyParams.error_description,
      };

      // Validate state parameter
      if (!query.state) {
        return reply.redirect(302, `${config.app.url}/error?error=missing_state`);
      }

      // Retrieve state from Redis - use get() first to check if it exists
      // We'll consume it later only if needed (test mode consumes immediately)
      let stateDataFromRedis = await ssoState.get(query.state);
      if (!stateDataFromRedis) {
        return reply.redirect(302, `${config.app.url}/error?error=invalid_state`);
      }

      const storeId = stateDataFromRedis.storeId as string;
      const providerId = stateDataFromRedis.providerId as string;
      const isTestMode = stateDataFromRedis.isTestMode === true;
      const codeVerifier = stateDataFromRedis.codeVerifier as string | undefined;

      // Handle TEST mode - show result page instead of logging in
      // For test mode, consume the state immediately since it's a one-time test
      if (isTestMode) {
        // Consume state for test mode (one-time use)
        const consumedState = await ssoState.consume(query.state);
        if (!consumedState) {
          return reply.type('text/html').send(generateTestResultHtml({
            success: false,
            error: 'Invalid or expired state',
            provider: 'Unknown',
          }));
        }
        // Use consumed state data
        stateDataFromRedis = consumedState;
        
        try {
          // Get provider info
          const provider = await ssoProvidersService.findByIdWithConfig(providerId);
          const providerConfig = provider.decryptedConfig;

          if (query.error) {
            return reply.type('text/html').send(generateTestResultHtml({
              success: false,
              error: query.error_description || query.error,
              provider: provider.displayName,
              details: { error: query.error, error_description: query.error_description },
            }));
          }

          if (!query.code) {
            return reply.type('text/html').send(generateTestResultHtml({
              success: false,
              error: 'No authorization code received',
              provider: provider.displayName,
            }));
          }

          // Exchange code for tokens
          let tokenUrl: string;
          // Use OAUTH_CALLBACK_URL (Cloudflare tunnel to backend) for OAuth callbacks
          const redirectUri = `${config.oauth.callbackBaseUrl}/api/auth/oidc/${provider.providerType}/callback`;

          if (providerConfig.issuerUrl) {
            const discoveryUrl = (providerConfig.issuerUrl as string).endsWith('/')
              ? `${providerConfig.issuerUrl}.well-known/openid-configuration`
              : `${providerConfig.issuerUrl}/.well-known/openid-configuration`;

            const discoveryResponse = await fetch(discoveryUrl);
            const discovery = await discoveryResponse.json() as { token_endpoint: string };
            tokenUrl = discovery.token_endpoint;
          } else {
            const tokenUrls: Record<string, string> = {
              google: 'https://oauth2.googleapis.com/token',
              microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
              facebook: 'https://graph.facebook.com/v18.0/oauth/access_token',
              auth0: '', // Will use discovery
            };
            tokenUrl = tokenUrls[provider.providerType] || '';
          }

          if (!tokenUrl) {
            return reply.type('text/html').send(generateTestResultHtml({
              success: false,
              error: 'Could not determine token URL',
              provider: provider.displayName,
            }));
          }

          // Build token request with PKCE code_verifier if available
          const tokenParams: Record<string, string> = {
            client_id: providerConfig.clientId as string,
            client_secret: providerConfig.clientSecret as string,
            code: query.code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          };

          // Include code_verifier for PKCE (required by Google and some other providers)
          if (codeVerifier) {
            tokenParams.code_verifier = codeVerifier;
          }

          const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(tokenParams),
          });

          const tokens = await tokenResponse.json() as {
            access_token?: string;
            id_token?: string;
            error?: string;
            error_description?: string;
          };

          if (tokens.error) {
            return reply.type('text/html').send(generateTestResultHtml({
              success: false,
              error: tokens.error_description || tokens.error,
              provider: provider.displayName,
              details: tokens,
            }));
          }

          // Decode ID token if available
          let userInfo: Record<string, unknown> = {};
          if (tokens.id_token) {
            const parts = tokens.id_token.split('.');
            if (parts.length === 3) {
              try {
                userInfo = JSON.parse(Buffer.from(parts[1], 'base64').toString());
              } catch {
                // Ignore decode errors
              }
            }
          }

          return reply.type('text/html').send(generateTestResultHtml({
            success: true,
            message: 'OAuth flow completed successfully!',
            provider: provider.displayName,
            details: {
              hasAccessToken: !!tokens.access_token,
              hasIdToken: !!tokens.id_token,
              userEmail: userInfo.email,
              userName: userInfo.name,
              userSub: userInfo.sub,
            },
          }));
        } catch (error) {
          return reply.type('text/html').send(generateTestResultHtml({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }));
        }
      }

      // Normal login flow - consume state now (one-time use)
      // We already validated it exists above, now consume it to prevent replay attacks
      const consumedState = await ssoState.consume(query.state);
      if (!consumedState) {
        // State was already consumed or expired between get() and consume()
        return reply.redirect(302, `${config.app.url}/error?error=invalid_state`);
      }
      // Use consumed state data
      stateDataFromRedis = consumedState;
      
      // Check if this is a popup flow
      const returnTo = stateDataFromRedis.returnTo as string | undefined;
      const isPopup = returnTo?.includes('|popup=true');
      const actualReturnTo = returnTo?.split('|popup=true')[0] || '/account';

      // Handle OAuth errors BEFORE calling handleCallback (especially for popup mode)
      if (query.error) {
        // If popup mode, show error in popup
        if (isPopup) {
          const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Login Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .message {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      max-width: 400px;
    }
    .error-icon { font-size: 48px; margin-bottom: 1rem; }
    h2 { color: #e53935; margin: 0 0 1rem; }
    p { color: #666; margin: 0 0 1rem; line-height: 1.5; }
    button {
      background: #1a1a1a;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 1rem;
    }
    button:hover { background: #333; }
  </style>
</head>
<body>
  <div class="message">
    <div class="error-icon">❌</div>
    <h2>Login Failed</h2>
    <p><strong>Error:</strong> ${query.error_description || query.error}</p>
    <p style="font-size: 12px; color: #999;">This is usually a configuration issue. Please contact support.</p>
    <button onclick="window.close()">Close</button>
  </div>
</body>
</html>`;
          return reply.type('text/html').send(errorHtml);
        }
        // Not popup mode, redirect to error page
        return reply.redirect(302, `${config.app.url}/error?error=${encodeURIComponent(query.error)}`);
      }

      // Check for missing code
      if (!query.code) {
        if (isPopup) {
          const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Login Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .message {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      max-width: 400px;
    }
    .error-icon { font-size: 48px; margin-bottom: 1rem; }
    h2 { color: #e53935; margin: 0 0 1rem; }
    p { color: #666; margin: 0 0 1rem; }
    button {
      background: #1a1a1a;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover { background: #333; }
  </style>
</head>
<body>
  <div class="message">
    <div class="error-icon">❌</div>
    <h2>Login Failed</h2>
    <p>No authorization code received</p>
    <button onclick="window.close()">Close</button>
  </div>
</body>
</html>`;
          return reply.type('text/html').send(errorHtml);
        }
        return reply.redirect(302, `${config.app.url}/error?error=missing_code`);
      }

      try {
        const result = await authService.handleCallback(
          storeId,
          providerId,
          {
            code: query.code,
            state: query.state,
            error: query.error,
            errorDescription: query.error_description,
          },
          request.ip,
          request.headers['user-agent'],
          stateDataFromRedis // Pass consumed state data to avoid double consumption
        );

        // If popup mode, send credentials via postMessage for parent to fill form
        if (isPopup) {
          // For password method, send credentials directly
          if (result.method === 'password' && result.email && result.password) {
            const popupHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Login Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .message {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.1);
      border-radius: 12px;
      backdrop-filter: blur(10px);
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="message">
    <div class="spinner"></div>
    <h2>Login Successful!</h2>
    <p>Completing login...</p>
  </div>
  <script>
    if (window.opener) {
      // Send credentials to parent window to fill and submit form
      window.opener.postMessage({
        type: 'sso_login_credentials',
        email: '${result.email}',
        password: '${result.password}',
        returnTo: '${result.returnTo || '/account'}'
      }, '*');
      
      // Close popup after sending message
      setTimeout(function() { window.close(); }, 500);
    } else {
      // Not a popup, redirect normally
      window.location.href = '${result.returnTo || '/account'}';
    }
  </script>
</body>
</html>`;
            return reply.type('text/html').send(popupHtml);
          }
          
          // For multipass or other methods, redirect parent
          const popupHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Login Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .message {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.1);
      border-radius: 12px;
      backdrop-filter: blur(10px);
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="message">
    <div class="spinner"></div>
    <h2>Login Successful!</h2>
    <p>Redirecting you now...</p>
  </div>
  <script>
    if (window.opener) {
      try {
        window.opener.location.href = '${result.redirectUrl}';
      } catch (e) {
        // Cross-origin, use postMessage instead
        window.opener.postMessage({ type: 'sso_login_success', redirectUrl: '${result.redirectUrl}' }, '*');
      }
      setTimeout(function() { window.close(); }, 500);
    } else {
      window.location.href = '${result.redirectUrl}';
    }
  </script>
</body>
</html>`;
          return reply.type('text/html').send(popupHtml);
        }

        // For password method (non-popup), create a token and redirect to storefront
        if (result.method === 'password' && result.email && result.password && !isPopup) {
          // Generate a secure token
          const token = crypto.randomBytes(32).toString('hex');
          
          // Store credentials temporarily (5 min TTL, one-time use)
          await ssoCredentials.set(token, {
            email: result.email,
            password: result.password,
            returnTo: result.returnTo || '/account',
          });
          
          // Get store domain from database
          const store = await prisma.store.findUnique({
            where: { id: storeId },
            select: { domain: true },
          });
          
          // Build storefront login URL with token (URL-encode the token)
          const storefrontUrl = store?.domain
            ? `https://${store.domain}/account/login?sso_token=${encodeURIComponent(token)}`
            : result.returnTo || '/account';
          
          logger.info({ 
            token: token.substring(0, 8) + '...',
            storeDomain: store?.domain,
            returnTo: result.returnTo 
          }, 'Redirecting to storefront with SSO token');
          
          return reply.redirect(302, storefrontUrl);
        }

        // For activation_email method, redirect to email sent confirmation page
        if (result.method === 'activation_email' && result.redirectUrl) {
          return reply.redirect(302, result.redirectUrl);
        }

        return reply.redirect(302, result.redirectUrl);
      } catch (error) {
        // Extract meaningful error message
        let errorMessage = 'Login failed';
        let errorDetails = '';
        
        if (error instanceof Error) {
          errorMessage = error.message || error.constructor.name;
          // For ShopifyApiError, extract the status code and details
          if (error.constructor.name === 'ShopifyApiError') {
            const shopifyError = error as any;
            if (shopifyError.statusCode === 401) {
              errorMessage = 'Invalid Shopify access token. Please re-authenticate the app.';
              errorDetails = 'The app needs to be re-authenticated with Shopify.';
            } else if (shopifyError.statusCode === 403) {
              errorMessage = 'Shopify API access denied. Check app permissions.';
            } else {
              errorMessage = `Shopify API error: ${shopifyError.statusCode}`;
              errorDetails = shopifyError.details || '';
            }
          }
        }
        
        logger.error({ 
          error, 
          errorMessage, 
          storeId, 
          providerId,
          isPopup 
        }, 'OAuth callback error');
        
        // If popup mode, show error in popup
        if (isPopup) {
          const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Login Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .message {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      max-width: 400px;
    }
    .error-icon { font-size: 48px; margin-bottom: 1rem; }
    h2 { color: #e53935; margin: 0 0 1rem; }
    p { color: #666; margin: 0 0 1rem; }
    .details { font-size: 12px; color: #999; margin-top: 0.5rem; }
    button {
      background: #1a1a1a;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 1rem;
    }
    button:hover { background: #333; }
  </style>
</head>
<body>
  <div class="message">
    <div class="error-icon">❌</div>
    <h2>Login Failed</h2>
    <p><strong>Error:</strong> ${errorMessage}</p>
    ${errorDetails ? `<p class="details">${errorDetails}</p>` : ''}
    <button onclick="window.close()">Close</button>
  </div>
</body>
</html>`;
          return reply.type('text/html').send(errorHtml);
        }
        
        return reply.redirect(302, `${config.app.url}/error?error=${encodeURIComponent(errorMessage)}`);
      }
    },
  });

  /**
   * SAML Callback (POST)
   * POST /api/auth/saml/:providerType/callback
   */
  fastify.post(
    '/saml/:providerType/callback',
    {
      schema: {
        tags: ['Auth'],
        summary: 'SAML callback endpoint',
        description: 'Handles the SAML response from identity providers',
        params: {
          type: 'object',
          required: ['providerType'],
          properties: {
            providerType: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            SAMLResponse: { type: 'string' },
            RelayState: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        SAMLResponse?: string;
        RelayState?: string;
      };

      // RelayState contains storeId:providerId
      const stateParts = body.RelayState?.split(':');
      if (!stateParts || stateParts.length < 2) {
        return reply.redirect(302, `${config.app.url}/error?error=invalid_state`);
      }

      const [storeId, providerId] = stateParts;

      try {
        const result = await authService.handleCallback(
          storeId!,
          providerId!,
          {
            samlResponse: body.SAMLResponse,
            relayState: body.RelayState,
          },
          request.ip,
          request.headers['user-agent']
        );

        return reply.redirect(302, result.redirectUrl);
      } catch (error) {
        const errorName = error instanceof Error ? error.constructor.name.toLowerCase().replace(/error$/, '') : 'unknown';
        return reply.redirect(302, `${config.app.url}/error?error=${errorName}`);
      }
    }
  );

  /**
   * Login events/analytics
   * GET /api/auth/events/:storeId
   */
  fastify.get(
    '/events/:storeId',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Get login events for a store',
        params: {
          type: 'object',
          required: ['storeId'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 50 },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            eventType: {
              type: 'string',
              enum: ['login_initiated', 'login_success', 'login_failed', 'logout', 'token_refresh'],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const query = request.query as {
        page?: number;
        limit?: number;
        startDate?: string;
        endDate?: string;
        eventType?: string;
      };

      const events = await authService.getLoginEvents(storeId, {
        page: query.page,
        limit: query.limit,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        eventType: query.eventType as 'login_initiated' | 'login_success' | 'login_failed' | 'logout' | 'token_refresh',
      });

      return reply.send(events);
    }
  );

  /**
   * SSO Login page for non-Plus stores
   * GET /sso/login
   */
  fastify.get(
    '/sso/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'SSO login page for non-Plus stores',
        description: 'Auto-submits login form with SSO credentials',
        querystring: {
          type: 'object',
          required: ['store', 'token'],
          properties: {
            store: { type: 'string' },
            token: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { store, token } = request.query as { store: string; token: string };

      try {
        const credentials = encryptionService.decrypt<{
          email: string;
          password: string;
          returnTo: string;
        }>(decodeURIComponent(token));

        // Get store domain
        const storeData = await fastify.prisma.store.findUnique({
          where: { id: store },
          select: { domain: true },
        });

        if (!storeData) {
          return reply.redirect(302, `${config.app.url}/error?error=store_not_found`);
        }

        // Return HTML page that auto-submits login form
        const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Logging in...</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .loader { text-align: center; }
    .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #333; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Logging you in...</p>
  </div>
  <form id="loginForm" method="POST" action="https://${storeData.domain}/account/login" style="display:none;">
    <input type="hidden" name="customer[email]" value="${credentials.email}" />
    <input type="hidden" name="customer[password]" value="${credentials.password}" />
    <input type="hidden" name="checkout_url" value="${credentials.returnTo}" />
  </form>
  <script>document.getElementById('loginForm').submit();</script>
</body>
</html>`;

        return reply.type('text/html').send(html);
      } catch (error) {
        return reply.redirect(302, `${config.app.url}/error?error=invalid_token`);
      }
    }
  );

  /**
   * Email sent confirmation page
   * GET /sso/email-sent
   */
  fastify.get(
    '/sso/email-sent',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Email sent confirmation page',
        description: 'Shows confirmation that account activation email was sent',
        querystring: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            returnTo: { type: 'string' },
            store: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, returnTo, store } = request.query as { 
        email?: string; 
        returnTo?: string; 
        store?: string;
      };

      const storefrontUrl = store ? `https://${store}` : null;
      const returnUrl = returnTo || '/account';

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Check Your Email</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 48px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      text-align: center;
    }
    .icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 12px;
    }
    .email {
      font-size: 18px;
      font-weight: 500;
      color: #667eea;
      margin-bottom: 24px;
      word-break: break-all;
    }
    .message {
      font-size: 16px;
      color: #666;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .steps {
      text-align: left;
      background: #f9fafb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 32px;
    }
    .step {
      display: flex;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .step:last-child {
      margin-bottom: 0;
    }
    .step-number {
      background: #667eea;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      margin-right: 12px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .step-text {
      flex: 1;
      color: #333;
      font-size: 14px;
      line-height: 1.5;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 14px 32px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      font-size: 16px;
      transition: transform 0.2s, box-shadow 0.2s;
      border: none;
      cursor: pointer;
    }
    .button:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
    }
    .back-link {
      margin-top: 24px;
      font-size: 14px;
      color: #666;
    }
    .back-link a {
      color: #667eea;
      text-decoration: none;
    }
    .back-link a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✉️</div>
    <h1>Check Your Email</h1>
    ${email ? `<div class="email">${email}</div>` : ''}
    <div class="message">
      We've sent you a secure login link. Click it to activate your account and sign in.
    </div>
    <div class="steps">
      <div class="step">
        <div class="step-number">1</div>
        <div class="step-text">Check your email inbox${email ? ` (${email})` : ''}</div>
      </div>
      <div class="step">
        <div class="step-number">2</div>
        <div class="step-text">Click the "Activate Account" link in the email</div>
      </div>
      <div class="step">
        <div class="step-number">3</div>
        <div class="step-text">You'll be automatically logged in to your account</div>
      </div>
    </div>
    ${storefrontUrl ? `
    <a href="${storefrontUrl}${returnUrl}" class="button">Return to Store</a>
    <div class="back-link">
      <a href="${storefrontUrl}/account/login">Back to Login</a>
    </div>
    ` : `
    <a href="${returnUrl}" class="button">Continue</a>
    `}
  </div>
</body>
</html>`;

      return reply.type('text/html').send(html);
    }
  );

  /**
   * OTP verification page
   * GET /sso/verify-otp
   */
  fastify.get(
    '/sso/verify-otp',
    {
      schema: {
        tags: ['Auth'],
        summary: 'OTP verification page',
        description: 'Shows OTP input form for email verification',
        querystring: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            returnTo: { type: 'string' },
            store: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, returnTo, store } = request.query as { 
        email?: string; 
        returnTo?: string; 
        store?: string;
      };

      if (!email) {
        return reply.redirect(302, `${config.app.url}/error?error=missing_email`);
      }

      const storefrontUrl = store ? `https://${store}` : null;
      const returnUrl = returnTo || '/account';
      const backendUrl = config.oauth.callbackBaseUrl || config.app.url;

      // Escape email for JavaScript
      const emailEscaped = email.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const returnUrlEscaped = (returnUrl || '/account').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const storeEscaped = (store || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Enter Verification Code</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 48px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      text-align: center;
    }
    .icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 12px;
    }
    .email {
      font-size: 18px;
      font-weight: 500;
      color: #667eea;
      margin-bottom: 24px;
      word-break: break-all;
    }
    .message {
      font-size: 16px;
      color: #666;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .otp-form {
      margin-bottom: 24px;
    }
    .otp-input {
      width: 100%;
      padding: 16px;
      font-size: 24px;
      text-align: center;
      letter-spacing: 8px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-weight: 700;
      margin-bottom: 16px;
      transition: border-color 0.3s;
    }
    .otp-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 14px 32px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      font-size: 16px;
      transition: transform 0.2s, box-shadow 0.2s;
      border: none;
      cursor: pointer;
      width: 100%;
    }
    .button:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
    }
    .button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    .error {
      color: #ef4444;
      font-size: 14px;
      margin-top: 8px;
      display: none;
    }
    .error.show {
      display: block;
    }
    .resend {
      margin-top: 24px;
      font-size: 14px;
      color: #666;
    }
    .resend a {
      color: #667eea;
      text-decoration: none;
      cursor: pointer;
    }
    .resend a:hover {
      text-decoration: underline;
    }
    .back-link {
      margin-top: 24px;
      font-size: 14px;
      color: #666;
    }
    .back-link a {
      color: #667eea;
      text-decoration: none;
    }
    .back-link a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔐</div>
    <h1>Enter Verification Code</h1>
    <div class="email" id="emailDisplay">${email}</div>
    <script>
      // Store email and other values in JavaScript variables for form submission
      window.OTP_EMAIL = ${JSON.stringify(email)};
      window.OTP_RETURN_TO = ${JSON.stringify(returnUrl)};
      window.OTP_STORE = ${JSON.stringify(store || '')};
      window.OTP_BACKEND_URL = ${JSON.stringify(backendUrl)};
    </script>
    <div class="message">
      We've sent a 6-digit code to your email. Enter it below to complete your login.
    </div>
      <form class="otp-form" id="otpForm" method="POST">
      <input 
        type="text" 
        name="otp" 
        class="otp-input" 
        id="otpInput"
        placeholder="000000"
        maxlength="6"
        pattern="[0-9]{6}"
        required
        autocomplete="one-time-code"
        autofocus
      />
      <div class="error" id="errorMessage"></div>
      <button type="submit" class="button" id="submitButton">Verify Code</button>
    </form>
    <div class="resend">
      Didn't receive the code? <a href="#" id="resendLink">Resend</a>
    </div>
    ${storefrontUrl ? `
    <div class="back-link">
      <a href="${storefrontUrl}/account/login">Back to Login</a>
    </div>
    ` : ''}
  </div>
  <script>
    const otpInput = document.getElementById('otpInput');
    const otpForm = document.getElementById('otpForm');
    const errorMessage = document.getElementById('errorMessage');
    const submitButton = document.getElementById('submitButton');
    const resendLink = document.getElementById('resendLink');

    // Submit OTP function - called by both auto-submit and button click
    async function submitOtp() {
      const otp = otpInput.value.trim();
      if (otp.length !== 6) {
        showError('Please enter a 6-digit code');
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Verifying...';

      try {
        // Get values from window variables (set by server-side script)
        const emailValue = window.OTP_EMAIL || document.getElementById('emailDisplay')?.textContent?.trim() || '';
        const returnToValue = window.OTP_RETURN_TO || '/account';
        const storeValue = window.OTP_STORE || '';
        const backendUrlValue = window.OTP_BACKEND_URL || window.location.origin;
        
        if (!emailValue) {
          showError('Email not found. Please refresh the page and try again.');
          submitButton.disabled = false;
          submitButton.textContent = 'Verify Code';
          return;
        }
        
        const formData = {
          email: emailValue,
          otp: otp,
          returnTo: returnToValue,
          store: storeValue
        };
        
        const response = await fetch(backendUrlValue + '/api/auth/sso/verify-otp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          const redirectUrl = result.redirectUrl || window.OTP_RETURN_TO || '/account';
          window.location.href = redirectUrl;
        } else {
          const errorText = result.error || 'Invalid code. Please try again.';
          showError(errorText);
          submitButton.disabled = false;
          submitButton.textContent = 'Verify Code';
          otpInput.value = '';
          otpInput.focus();
        }
      } catch (error) {
        showError('Network error. Please check your connection and try again.');
        submitButton.disabled = false;
        submitButton.textContent = 'Verify Code';
      }
    }

    // Auto-format OTP input (numbers only) and auto-submit when 6 digits entered
    otpInput.addEventListener('input', function(e) {
      this.value = this.value.replace(/[^0-9]/g, '');
      if (this.value.length === 6) {
        // Auto-submit when 6 digits entered - call the submit function directly
        setTimeout(() => submitOtp(), 300);
      }
    });

    // Handle form submission (button click)
    otpForm.addEventListener('submit', function(e) {
      e.preventDefault();
      submitOtp();
    });

    // Handle resend
    resendLink.addEventListener('click', async function(e) {
      e.preventDefault();
      resendLink.textContent = 'Sending...';
      resendLink.style.pointerEvents = 'none';

      try {
        const emailForResend = window.OTP_EMAIL || document.getElementById('emailDisplay')?.textContent?.trim() || '';
        const returnToForResend = window.OTP_RETURN_TO || '/account';
        const storeForResend = window.OTP_STORE || '';
        const backendUrlForResend = window.OTP_BACKEND_URL || window.location.origin;
        
        const response = await fetch(backendUrlForResend + '/api/auth/sso/resend-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailForResend, returnTo: returnToForResend, store: storeForResend }),
        });

        if (response.ok) {
          resendLink.textContent = 'Code sent!';
          setTimeout(() => {
            resendLink.textContent = 'Resend';
            resendLink.style.pointerEvents = 'auto';
          }, 2000);
        } else {
          resendLink.textContent = 'Failed. Try again.';
          setTimeout(() => {
            resendLink.textContent = 'Resend';
            resendLink.style.pointerEvents = 'auto';
          }, 2000);
        }
      } catch (error) {
        resendLink.textContent = 'Error. Try again.';
        setTimeout(() => {
          resendLink.textContent = 'Resend';
          resendLink.style.pointerEvents = 'auto';
        }, 2000);
      }
    });

    function showError(message) {
      errorMessage.textContent = message;
      errorMessage.classList.add('show');
      setTimeout(() => {
        errorMessage.classList.remove('show');
      }, 5000);
    }

    // Check for error in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('error')) {
      showError(urlParams.get('error'));
    }
  </script>
</body>
</html>`;

      return reply.type('text/html').send(html);
    }
  );

  /**
   * Verify OTP
   * POST /sso/verify-otp
   */
  fastify.post(
    '/sso/verify-otp',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Verify OTP code',
        description: 'Verifies the OTP code and logs the user in',
        // Make schema less strict to allow manual validation
        body: {
          type: 'object',
        },
      },
    },
    async (request, reply) => {
      // Parse body - handle both JSON string and object
      let body: any;
      if (typeof request.body === 'string') {
        try {
          body = JSON.parse(request.body);
        } catch (e) {
          logger.error({ body: request.body }, 'Failed to parse JSON body');
          return reply.code(400).send({ 
            success: false, 
            error: 'Invalid request format' 
          });
        }
      } else {
        body = request.body;
      }

      // Log the parsed body for debugging
      logger.info({ 
        body,
        bodyType: typeof request.body,
        headers: request.headers['content-type'],
      }, 'OTP verification request received');

      const email = body?.email;
      const otp = body?.otp;
      const returnTo = body?.returnTo;
      const store = body?.store;

      if (!email || !otp) {
        logger.warn({ body, email: !!email, otp: !!otp }, 'Missing email or OTP in request');
        return reply.code(400).send({ 
          success: false, 
          error: 'Email and OTP are required' 
        });
      }

      try {
        // Verify OTP
        const otpData = await ssoOtp.verify(email, otp);

        if (!otpData) {
          logger.warn({ email }, 'OTP verification failed - invalid or expired');
          return reply.code(400).send({ 
            success: false, 
            error: 'Invalid or expired code. Please request a new code.' 
          });
        }

        if (!otpData.customerId) {
          logger.error({ email, otpData }, 'OTP verified but customerId is missing');
          return reply.code(400).send({ 
            success: false, 
            error: 'Customer information not found. Please try logging in again.' 
          });
        }

        // Get store and credentials
        const storeData = await prisma.store.findUnique({
          where: { id: otpData.storeId },
          select: { domain: true, credentials: true },
        });

        if (!storeData) {
          logger.error({ storeId: otpData.storeId }, 'Store not found during OTP verification');
          return reply.code(400).send({ 
            success: false, 
            error: 'Store not found' 
          });
        }

        const credentials = encryptionService.decrypt<{ accessToken: string }>(storeData.credentials);
        const shopify = createShopifyService(storeData.domain, credentials.accessToken);

        // Get customer
        const customerId = parseInt(otpData.customerId);
        if (isNaN(customerId)) {
          logger.error({ customerId: otpData.customerId }, 'Invalid customer ID format');
          return reply.code(400).send({ 
            success: false, 
            error: 'Invalid customer information. Please try again.' 
          });
        }

        let customer;
        try {
          customer = await shopify.getCustomer(customerId);
        } catch (error) {
          logger.error({ error, customerId, email }, 'Failed to get customer from Shopify');
          return reply.code(400).send({ 
            success: false, 
            error: 'Failed to retrieve customer information. Please try again.' 
          });
        }

        // After OTP verification, log the user in directly
        // Priority 1: Try account activation URL (best - activates and logs in automatically)
        // Priority 2: Use password-based login with auto-fill (fallback)
        let redirectUrl;
        const finalReturnTo = otpData.returnTo || returnTo || '/account';
        
        try {
          // Try to get account activation URL first
          const activationUrl = await shopify.getAccountActivationUrl(customer.id);
          redirectUrl = `${activationUrl}${activationUrl.includes('?') ? '&' : '?'}return_to=${encodeURIComponent(finalReturnTo)}`;
          
          logger.info({ 
            email, 
            customerId: customer.id,
            storeDomain: storeData.domain,
            activationUrl: activationUrl.substring(0, 50) + '...'
          }, 'OTP verified, redirecting to account activation (will auto-login)');
        } catch (error) {
          // Account activation failed - customer might already be activated or endpoint doesn't exist
          // Use password-based login with auto-fill as fallback
          logger.info({ 
            error: error instanceof Error ? error.message : String(error), 
            customerId: customer.id,
            email 
          }, 'Account activation URL not available, using password login with auto-fill');
          
          // Generate a deterministic password for this customer
          const password = passwordService.generatePassword(storeData.domain, customer.email);
          
          // Update customer password in Shopify
          try {
            await shopify.updateCustomerPassword(customer.id, password);
            logger.info({ customerId: customer.id }, 'Customer password updated for login');
          } catch (pwdError) {
            logger.warn({ 
              error: pwdError instanceof Error ? pwdError.message : String(pwdError), 
              customerId: customer.id 
            }, 'Failed to update customer password, continuing anyway');
          }
          
          // Create a token for auto-filling login form (stored in Redis, 5 min TTL)
          const token = crypto.randomBytes(32).toString('hex');
          await ssoCredentials.set(token, {
            email: customer.email,
            password: password,
            returnTo: finalReturnTo,
          });
          
          // Redirect to login page with token - frontend extension will auto-fill and submit
          redirectUrl = `https://${storeData.domain}/account/login?sso_token=${encodeURIComponent(token)}`;
          
          logger.info({ 
            email, 
            customerId: customer.id, 
            storeDomain: storeData.domain,
            tokenPreview: token.substring(0, 8) + '...'
          }, 'OTP verified, redirecting to login with auto-fill token');
        }

        return reply.send({ 
          success: true, 
          redirectUrl 
        });
      } catch (error) {
        logger.error({ 
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          email 
        }, 'OTP verification failed with unexpected error');
        return reply.code(500).send({ 
          success: false, 
          error: 'Verification failed. Please try again.' 
        });
      }
    }
  );

  /**
   * Resend OTP
   * POST /sso/resend-otp
   */
  fastify.post(
    '/sso/resend-otp',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Resend OTP code',
        description: 'Resends OTP code to email',
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string' },
            returnTo: { type: 'string' },
            store: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, returnTo, store } = request.body as { 
        email: string; 
        returnTo?: string; 
        store?: string;
      };

      try {
        // Check if OTP exists (user might have requested resend before expiry)
        const existingOtp = await ssoOtp.get(email);
        
        if (existingOtp) {
          // Regenerate and send new OTP
          const newOtp = generateOtp();
          
          await ssoOtp.set(email, newOtp, {
            storeId: existingOtp.storeId,
            customerId: existingOtp.customerId,
            returnTo: returnTo || existingOtp.returnTo,
          });

          // Get store domain for email
          const storeData = await prisma.store.findUnique({
            where: { id: existingOtp.storeId },
            select: { domain: true },
          });

          if (storeData) {
            await emailService.sendOtpEmail(email, newOtp, storeData.domain);
          }

          logger.info({ email }, 'OTP resent');
          return reply.send({ success: true, message: 'Code resent successfully' });
        } else {
          return reply.code(400).send({ 
            success: false, 
            error: 'No active verification session. Please start the login process again.' 
          });
        }
      } catch (error) {
        logger.error({ error, email }, 'Failed to resend OTP');
        return reply.code(500).send({ 
          success: false, 
          error: 'Failed to resend code. Please try again.' 
        });
      }
    }
  );
};

export default authRoutes;
