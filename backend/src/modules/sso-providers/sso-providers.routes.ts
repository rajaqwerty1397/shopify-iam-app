import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { generators } from 'openid-client';
import { ssoProvidersController } from './sso-providers.controller.js';
import { ssoProvidersService } from './sso-providers.service.js';
import { storesService } from '../stores/stores.service.js';
import { validateRequest } from '../../common/middleware/validate.js';
import {
  createSsoProviderSchema,
  updateSsoProviderSchema,
  listSsoProvidersQuerySchema,
  ssoProviderIdParamSchema,
} from './sso-providers.schema.js';
import { z } from 'zod';
import { StoreNotFoundError } from '../../common/errors/index.js';
import { config } from '../../config/index.js';
import { ssoState } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';

const storeIdParamSchema = z.object({ storeId: z.string().uuid() });

/**
 * Get store from domain header
 */
async function getStoreFromDomain(domain: string | undefined) {
  if (!domain) {
    throw new StoreNotFoundError('X-Shop-Domain header is required');
  }
  return storesService.findByDomain(domain);
}

/**
 * SSO Providers Routes
 */
const ssoProvidersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Create provider (accepts frontend format with shop domain)
  fastify.post(
    '/',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Create a new SSO provider',
        headers: {
          type: 'object',
          properties: {
            'x-shop-domain': { type: 'string', description: 'Store domain' },
          },
        },
        body: {
          type: 'object',
          required: ['name', 'type'],
          properties: {
            // Frontend format
            name: { type: 'string' },
            type: { type: 'string', enum: ['saml', 'oauth'] },
            provider: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive', 'draft'] },
            config: { type: 'object' },
            // Original backend format (for backwards compatibility)
            storeId: { type: 'string', format: 'uuid' },
            providerType: { type: 'string' },
            protocol: { type: 'string', enum: ['oidc', 'saml'] },
            displayName: { type: 'string' },
            iconUrl: { type: 'string', format: 'uri' },
            displayOrder: { type: 'integer', default: 0 },
            isEnabled: { type: 'boolean', default: true },
            isDefault: { type: 'boolean', default: false },
            buttonStyle: { type: 'object' },
            displayLocation: { type: 'object' },
            scopeMappings: { type: 'object' },
            attributeMap: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const domain = request.headers['x-shop-domain'] as string;
      const body = request.body as any;

      // If using frontend format, convert to backend format
      if (body.name && body.type && !body.storeId) {
        const store = await getStoreFromDomain(domain);

        // CRITICAL FIX: Ensure providerType is correct - "auth" should be "auth0"
        let providerType = body.provider || body.type;
        if (providerType === 'auth' && (body.name?.toLowerCase().includes('auth0') || body.provider === 'auth0')) {
          logger.warn({ 
            originalProviderType: providerType,
            name: body.name,
            provider: body.provider,
            fixedTo: 'auth0'
          }, 'Fixing providerType from "auth" to "auth0" during provider creation');
          providerType = 'auth0';
        }

        const backendData = {
          storeId: store.id,
          providerType: providerType,
          protocol: body.type === 'oauth' ? 'oidc' : body.type,
          displayName: body.name,
          isEnabled: body.status === 'active',
          status: body.status || 'draft',
          config: body.config || {},
        };

        const provider = await ssoProvidersService.create(backendData as any);
        return reply.status(201).send(provider);
      }

      // Original backend format
      return ssoProvidersController.create(request as any, reply);
    }
  );

  // List providers (supports X-Shop-Domain header)
  fastify.get(
    '/',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'List SSO providers',
        headers: {
          type: 'object',
          properties: {
            'x-shop-domain': { type: 'string', description: 'Store domain' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
            storeId: { type: 'string', format: 'uuid' },
            protocol: { type: 'string', enum: ['oidc', 'saml'] },
            providerType: { type: 'string' },
            status: { type: 'string', enum: ['active', 'disabled', 'pending_setup'] },
            isEnabled: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const domain = request.headers['x-shop-domain'] as string;
      const query = request.query as any;

      // If shop domain is provided, use it to get store ID
      if (domain && !query.storeId) {
        try {
          const store = await getStoreFromDomain(domain);
          query.storeId = store.id;
        } catch (error) {
          // Return empty array if store not found
          return reply.send([]);
        }
      }

      const result = await ssoProvidersService.list(query);

      // Return just the data array for frontend compatibility
      return reply.send(result.data || []);
    }
  );

  // Get providers for a store (public endpoint)
  fastify.get(
    '/store/:storeId',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Get enabled providers for a store',
        params: {
          type: 'object',
          required: ['storeId'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: validateRequest({ params: storeIdParamSchema }),
    },
    ssoProvidersController.getStoreProviders.bind(ssoProvidersController)
  );

  // Test provider configuration (before saving - for new providers)
  // IMPORTANT: This route MUST be before /:id to avoid route conflict
  fastify.post(
    '/test',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Test provider configuration',
        description: 'Tests a provider configuration before saving it',
        headers: {
          type: 'object',
          properties: {
            'x-shop-domain': { type: 'string', description: 'Store domain' },
          },
        },
        body: {
          type: 'object',
          required: ['type', 'provider', 'config'],
          properties: {
            type: { type: 'string', enum: ['saml', 'oauth'] },
            provider: { type: 'string' },
            config: {
              type: 'object',
              properties: {
                entityId: { type: 'string' },
                ssoUrl: { type: 'string' },
                certificate: { type: 'string' },
                clientId: { type: 'string' },
                clientSecret: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        type: string;
        provider: string;
        config: {
          entityId?: string;
          ssoUrl?: string;
          certificate?: string;
          clientId?: string;
          clientSecret?: string;
        };
      };

      const checks: Record<string, any> = {
        provider_type: body.type,
        provider: body.provider,
        configuration_received: true,
      };

      try {
        if (body.type === 'saml') {
          const { entityId, ssoUrl, certificate } = body.config;

          if (!entityId) {
            return reply.send({
              success: false,
              message: 'Entity ID is required for SAML configuration',
              details: { checks, error: 'missing_entity_id' },
            });
          }

          if (!ssoUrl) {
            return reply.send({
              success: false,
              message: 'SSO URL is required for SAML configuration',
              details: { checks, error: 'missing_sso_url' },
            });
          }

          checks.entity_id_provided = !!entityId;
          checks.sso_url_provided = !!ssoUrl;
          checks.certificate_provided = !!certificate;

          try {
            new URL(ssoUrl);
            checks.sso_url_valid = true;
          } catch {
            return reply.send({
              success: false,
              message: 'Invalid SSO URL format',
              details: { checks, error: 'invalid_sso_url' },
            });
          }

          if (certificate) {
            checks.certificate_format_valid = certificate.includes('BEGIN');
          }

          return reply.send({
            success: true,
            message: 'SAML configuration is valid. Provider is ready to be saved.',
            details: { checks },
          });
        } else if (body.type === 'oauth') {
          const { clientId, clientSecret } = body.config;

          if (!clientId) {
            return reply.send({
              success: false,
              message: 'Client ID is required for OAuth configuration',
              details: { checks, error: 'missing_client_id' },
            });
          }

          if (!clientSecret) {
            return reply.send({
              success: false,
              message: 'Client Secret is required for OAuth configuration',
              details: { checks, error: 'missing_client_secret' },
            });
          }

          checks.client_id_provided = !!clientId;
          checks.client_secret_provided = !!clientSecret;

          return reply.send({
            success: true,
            message: 'OAuth configuration is valid. Provider is ready to be saved.',
            details: { checks },
          });
        }

        return reply.send({
          success: false,
          message: 'Unknown provider type',
          details: { checks, error: 'unknown_type' },
        });
      } catch (error) {
        return reply.send({
          success: false,
          message: `Configuration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { checks, error: String(error) },
        });
      }
    }
  );

  // Get provider by ID
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Get SSO provider by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: validateRequest({ params: ssoProviderIdParamSchema }),
    },
    ssoProvidersController.findById.bind(ssoProvidersController)
  );

  // Get provider with details (for frontend edit page)
  fastify.get(
    '/:id/details',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Get SSO provider with details for editing',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const providerData = await ssoProvidersService.findByIdWithConfig(id);

        // Transform to frontend format
        const provider = {
          id: providerData.id,
          name: providerData.displayName,
          type: providerData.protocol,
          provider: providerData.providerType,
          providerType: providerData.providerType, // Add explicit providerType field for callback URL generation
          status: providerData.status,
          isEnabled: providerData.isEnabled,
          // Flatten config for frontend
          entityId: providerData.decryptedConfig?.entityId || providerData.decryptedConfig?.entryPoint || '',
          ssoUrl: providerData.decryptedConfig?.ssoUrl || providerData.decryptedConfig?.entryPoint || '',
          certificate: providerData.decryptedConfig?.certificate || providerData.decryptedConfig?.cert || '',
          clientId: providerData.decryptedConfig?.clientId || '',
          clientSecret: providerData.decryptedConfig?.clientSecret ? '********' : '',
          issuerUrl: providerData.decryptedConfig?.issuerUrl || '',
          jitProvisioning: providerData.decryptedConfig?.jitProvisioning || false,
          enforceForDomain: providerData.decryptedConfig?.enforceForDomain || '',
          createdAt: providerData.createdAt,
          updatedAt: providerData.updatedAt,
          _count: { userLinks: 0, loginFlows: 0 },
        };

        // Get recent logins for this provider
        const recentLogins: any[] = [];

        return reply.send({ provider, recentLogins });
      } catch (error) {
        return reply.status(404).send({ error: 'Provider not found' });
      }
    }
  );

  // Update provider (PATCH - backend format)
  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Update SSO provider',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            displayName: { type: 'string' },
            iconUrl: { type: 'string', format: 'uri', nullable: true },
            displayOrder: { type: 'integer' },
            isEnabled: { type: 'boolean' },
            isDefault: { type: 'boolean' },
            buttonStyle: { type: 'object' },
            displayLocation: { type: 'object' },
            config: { type: 'object' },
            scopeMappings: { type: 'object' },
            attributeMap: { type: 'object' },
            status: { type: 'string', enum: ['active', 'disabled', 'pending_setup'] },
          },
        },
      },
      preHandler: validateRequest({
        params: ssoProviderIdParamSchema,
        body: updateSsoProviderSchema,
      }),
    },
    ssoProvidersController.update.bind(ssoProvidersController)
  );

  // Update provider (PUT - frontend format with flat config)
  fastify.put(
    '/:id',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Update SSO provider (frontend format)',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            entityId: { type: 'string' },
            ssoUrl: { type: 'string' },
            certificate: { type: 'string' },
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            issuerUrl: { type: 'string' },
            jitProvisioning: { type: 'boolean' },
            enforceForDomain: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      // Transform frontend format to backend format
      const config: Record<string, any> = {};
      if (body.entityId) config.entityId = body.entityId;
      if (body.ssoUrl) config.entryPoint = body.ssoUrl;
      if (body.certificate) config.cert = body.certificate;
      if (body.clientId) config.clientId = body.clientId;
      if (body.clientSecret && body.clientSecret !== '********') config.clientSecret = body.clientSecret;
      if (body.issuerUrl) config.issuerUrl = body.issuerUrl;
      if (body.jitProvisioning !== undefined) config.jitProvisioning = body.jitProvisioning;
      if (body.enforceForDomain) config.enforceForDomain = body.enforceForDomain;

      const updateData: any = {};
      if (body.name) updateData.displayName = body.name;
      if (Object.keys(config).length > 0) updateData.config = config;

      try {
        const provider = await ssoProvidersService.update(id, updateData);
        return reply.send(provider);
      } catch (error) {
        return reply.status(500).send({ error: 'Failed to update provider' });
      }
    }
  );

  // Delete provider
  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Delete SSO provider',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: validateRequest({ params: ssoProviderIdParamSchema }),
    },
    ssoProvidersController.delete.bind(ssoProvidersController)
  );

  // Enable/disable provider
  fastify.post(
    '/:id/enabled',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Enable or disable provider',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['isEnabled'],
          properties: {
            isEnabled: { type: 'boolean' },
          },
        },
      },
    },
    ssoProvidersController.setEnabled.bind(ssoProvidersController)
  );

  // Set as default
  fastify.post(
    '/:id/default',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Set provider as default',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    ssoProvidersController.setDefault.bind(ssoProvidersController)
  );

  // Toggle provider status (enable/disable)
  fastify.post(
    '/:id/toggle',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Toggle provider enabled status',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['enabled'],
          properties: {
            enabled: { type: 'boolean' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { enabled } = request.body as { enabled: boolean };
      const provider = await ssoProvidersController.toggleEnabled(id, enabled);
      return reply.send({ success: true, data: provider });
    }
  );

  // Test provider connection (existing provider) - configuration check
  fastify.post(
    '/:id/test',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Test provider connection',
        description: 'Tests the provider configuration without enabling it',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        // Allow empty body - the frontend sends POST with no body
        body: {
          type: 'object',
          additionalProperties: true,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              checks: {
                type: 'object',
                properties: {
                  metadata_reachable: { type: 'boolean' },
                  certificate_valid: { type: 'boolean' },
                  endpoints_configured: { type: 'boolean' },
                },
              },
              error: { type: 'string', nullable: true },
            },
          },
        },
      },
      // Accept requests with empty body
      config: {
        rawBody: true,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await ssoProvidersController.testConnection(id);
      return reply.send(result);
    }
  );

  // Test OAuth flow - initiate (GET request that redirects to IdP)
  // Uses the SAME callback URL as regular login to avoid needing multiple callback URLs in IdP config
  // Now with proper PKCE support for Google and other providers that require it
  fastify.get(
    '/:id/test/oauth',
    {
      schema: {
        tags: ['SSO Providers'],
        summary: 'Initiate OAuth test flow',
        description: 'Opens IdP login for testing - uses same callback as normal login with PKCE',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const provider = await ssoProvidersService.findByIdWithConfig(id);
        const providerConfig = provider.decryptedConfig;
        
        // Use OAUTH_CALLBACK_URL (Cloudflare tunnel to backend) for OAuth callbacks
        // This is separate from SHOPIFY_APP_URL (ngrok to frontend)
        // ALWAYS read directly from env to avoid cached config issues (same as createProvider)
        const callbackBaseUrlFromEnv = process.env.OAUTH_CALLBACK_URL || process.env.SHOPIFY_APP_URL || config.oauth.callbackBaseUrl;
        const callbackBaseUrl = callbackBaseUrlFromEnv.replace(/\/$/, ''); // Remove trailing slash

        if (provider.protocol === 'oidc') {
          // Build OAuth authorization URL with PKCE
          // IMPORTANT: Use the SAME callback URL building logic as createProvider() to ensure consistency
          // CRITICAL FIX: Ensure providerType is correct (fix "auth" -> "auth0" if needed)
          let providerType = provider.providerType;
          // Fix common mistake: if providerType is "auth" but displayName suggests Auth0, use "auth0"
          if (providerType === 'auth' && (provider.displayName?.toLowerCase().includes('auth0') || provider.displayName?.toLowerCase() === 'auth0')) {
            logger.warn({ 
              originalProviderType: provider.providerType,
              displayName: provider.displayName,
              fixedTo: 'auth0'
            }, 'Fixing providerType from "auth" to "auth0" based on displayName');
            providerType = 'auth0';
          }
          
          const callbackUrl = `${callbackBaseUrl}/api/auth`;
          const redirectUri = `${callbackUrl}/oidc/${providerType}/callback`.replace(/([^:]\/)\/+/g, '$1');
          
          logger.info({
            providerType_original: provider.providerType,
            providerType_used: providerType,
            displayName: provider.displayName,
            OAUTH_CALLBACK_URL_env: process.env.OAUTH_CALLBACK_URL || '(not set)',
            SHOPIFY_APP_URL_env: process.env.SHOPIFY_APP_URL || '(not set)',
            callbackBaseUrl_fromConfig: config.oauth.callbackBaseUrl,
            callbackBaseUrl_used: callbackBaseUrl,
            redirectUri,
            warning: 'Test OAuth flow - This exact callback URL MUST match your OAuth provider settings',
          }, '=== TEST OAUTH FLOW - Callback URL Info ===');

          // Generate proper state, nonce, and PKCE values
          const state = generators.state();
          const nonce = generators.nonce();
          const codeVerifier = generators.codeVerifier();
          const codeChallenge = generators.codeChallenge(codeVerifier);

          // Store state in Redis with TEST_ marker for test flow identification
          await ssoState.set(state, {
            storeId: provider.storeId,
            providerId: id,
            nonce,
            codeVerifier,
            isTestMode: true, // Mark as test mode
            createdAt: Date.now(),
          });

          // Build OAuth authorization URL
          let authUrl: string;
          if (providerConfig.issuerUrl) {
            // Use OIDC discovery
            const discoveryUrl = (providerConfig.issuerUrl as string).endsWith('/')
              ? `${providerConfig.issuerUrl}.well-known/openid-configuration`
              : `${providerConfig.issuerUrl}/.well-known/openid-configuration`;

            const discoveryResponse = await fetch(discoveryUrl);
            const discovery = await discoveryResponse.json() as { authorization_endpoint: string };

            authUrl = discovery.authorization_endpoint;
          } else {
            // Provider-specific URLs
            const authUrls: Record<string, string> = {
              google: 'https://accounts.google.com/o/oauth2/v2/auth',
              microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
              facebook: 'https://www.facebook.com/v18.0/dialog/oauth',
            };
            authUrl = authUrls[providerType] || '';
          }

          if (!authUrl) {
            return reply.type('text/html').send(generateTestResultPage({
              success: false,
              error: 'Could not determine authorization URL for this provider',
              provider: provider.displayName,
            }));
          }

          // Log the exact redirect_uri being sent - must match OAuth provider settings
          logger.info({ 
            redirectUri, 
            provider_original: provider.providerType,
            provider_used: providerType,
            authUrl: authUrl.split('?')[0], // URL without query params
            warning: 'CRITICAL: The redirect_uri below MUST be exactly added to your OAuth provider settings'
          }, 'Test OAuth flow - redirecting to OAuth provider');
          
          const params = new URLSearchParams({
            client_id: providerConfig.clientId as string,
            redirect_uri: redirectUri, // This exact URL must be in Google Cloud Console / Auth0 settings
            response_type: 'code',
            scope: 'openid profile email',
            state: state,
            nonce: nonce,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
          });

          return reply.redirect(302, `${authUrl}?${params.toString()}`);
        } else if (provider.protocol === 'saml') {
          // SAML test would require more setup - show info page
          return reply.type('text/html').send(generateTestResultPage({
            success: true,
            message: 'SAML provider configured',
            provider: provider.displayName,
            details: {
              ssoUrl: providerConfig.entryPoint || providerConfig.ssoUrl,
              certificateProvided: !!(providerConfig.cert || providerConfig.certificate),
            },
          }));
        }

        return reply.type('text/html').send(generateTestResultPage({
          success: false,
          error: 'Unknown protocol',
          provider: provider.displayName,
        }));
      } catch (error) {
        return reply.type('text/html').send(generateTestResultPage({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    }
  );

};

/**
 * Generate HTML page for test results (shown in popup)
 */
function generateTestResultPage(result: {
  success: boolean;
  message?: string;
  error?: string;
  provider?: string;
  details?: Record<string, unknown>;
}): string {
  const statusColor = result.success ? '#22c55e' : '#ef4444';
  const statusIcon = result.success ? '✓' : '✗';
  const statusText = result.success ? 'Success' : 'Failed';

  const detailsHtml = result.details
    ? `<pre style="background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto;font-size:12px;">${JSON.stringify(result.details, null, 2)}</pre>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SSO Test Result</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f9fafb;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      padding: 32px;
      max-width: 500px;
      width: 100%;
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
      margin: 0 auto 20px;
    }
    h1 { font-size: 24px; margin-bottom: 8px; color: ${statusColor}; }
    .provider { color: #666; margin-bottom: 16px; }
    .message { color: #333; margin-bottom: 20px; }
    .details { text-align: left; margin-top: 20px; }
    .details-title { font-weight: 600; margin-bottom: 8px; color: #333; }
    button {
      background: #333;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      margin-top: 20px;
    }
    button:hover { background: #555; }
  </style>
</head>
<body>
  <div class="container">
    <div class="status-icon">${statusIcon}</div>
    <h1>${statusText}</h1>
    ${result.provider ? `<p class="provider">${result.provider}</p>` : ''}
    <p class="message">${result.message || result.error || ''}</p>
    ${detailsHtml ? `<div class="details"><p class="details-title">Details:</p>${detailsHtml}</div>` : ''}
    <button onclick="window.close()">Close Window</button>
  </div>
  <script>
    // Send result to parent window if opened as popup
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

export default ssoProvidersRoutes;
