import { FastifyRequest, FastifyReply } from 'fastify';
import { ssoProvidersService } from './sso-providers.service.js';
import {
  CreateSsoProviderInput,
  UpdateSsoProviderInput,
  ListSsoProvidersQuery,
} from './sso-providers.schema.js';

/**
 * SSO Providers Controller
 */
export class SsoProvidersController {
  async create(
    request: FastifyRequest<{ Body: CreateSsoProviderInput }>,
    reply: FastifyReply
  ) {
    const provider = await ssoProvidersService.create(request.body);
    return reply.status(201).send(provider);
  }

  async findById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const provider = await ssoProvidersService.findById(request.params.id);
    return reply.send(provider);
  }

  async list(
    request: FastifyRequest<{ Querystring: ListSsoProvidersQuery }>,
    reply: FastifyReply
  ) {
    const result = await ssoProvidersService.list(request.query);
    return reply.send(result);
  }

  async getStoreProviders(
    request: FastifyRequest<{ Params: { storeId: string } }>,
    reply: FastifyReply
  ) {
    const providers = await ssoProvidersService.getStoreProviders(request.params.storeId);
    return reply.send(providers);
  }

  async update(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateSsoProviderInput;
    }>,
    reply: FastifyReply
  ) {
    const provider = await ssoProvidersService.update(request.params.id, request.body);
    return reply.send(provider);
  }

  async delete(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    await ssoProvidersService.delete(request.params.id);
    return reply.status(204).send();
  }

  async setEnabled(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { isEnabled: boolean };
    }>,
    reply: FastifyReply
  ) {
    const provider = await ssoProvidersService.setEnabled(request.params.id, request.body.isEnabled);
    return reply.send(provider);
  }

  async setDefault(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const provider = await ssoProvidersService.setDefault(request.params.id);
    return reply.send(provider);
  }

  /**
   * Toggle provider enabled status
   */
  async toggleEnabled(id: string, enabled: boolean) {
    return ssoProvidersService.setEnabled(id, enabled);
  }

  /**
   * Test provider connection
   */
  async testConnection(id: string): Promise<{
    success: boolean;
    message: string;
    checks: {
      metadata_reachable: boolean;
      certificate_valid: boolean;
      endpoints_configured: boolean;
    };
    details?: Record<string, any>;
    error?: string;
  }> {
    try {
      const provider = await ssoProvidersService.findByIdWithConfig(id);
      const config = provider.decryptedConfig;

      const checks = {
        metadata_reachable: true, // Default to true, only set false if check fails
        certificate_valid: true,
        endpoints_configured: false,
      };

      const details: Record<string, any> = {
        provider_type: provider.providerType,
        protocol: provider.protocol,
      };

      // Check if endpoints are configured
      if (provider.protocol === 'oidc') {
        // For OAuth/OIDC providers, check for clientId and clientSecret
        const hasClientId = !!(config.clientId);
        const hasClientSecret = !!(config.clientSecret);
        const hasIssuerUrl = !!(config.issuerUrl);

        // OAuth providers without issuerUrl (custom OAuth, Auth0, etc.) only need clientId and clientSecret
        checks.endpoints_configured = hasClientId && hasClientSecret;

        details.client_id_provided = hasClientId;
        details.client_secret_provided = hasClientSecret;
        details.issuer_url_provided = hasIssuerUrl;

        // If issuerUrl is provided, try to reach the OIDC discovery endpoint
        if (hasIssuerUrl) {
          try {
            const issuerUrl = config.issuerUrl as string;
            const discoveryUrl = issuerUrl.endsWith('/')
              ? `${issuerUrl}.well-known/openid-configuration`
              : `${issuerUrl}/.well-known/openid-configuration`;

            const response = await fetch(discoveryUrl, {
              method: 'GET',
              signal: AbortSignal.timeout(10000),
            });
            checks.metadata_reachable = response.ok;
            details.discovery_url = discoveryUrl;
            details.discovery_status = response.status;
          } catch (fetchError) {
            checks.metadata_reachable = false;
            details.discovery_error = fetchError instanceof Error ? fetchError.message : 'Network error';
          }
        } else {
          // For OAuth providers without discovery endpoint (Auth0, custom), skip metadata check
          checks.metadata_reachable = true;
          details.skip_discovery = 'No issuer URL configured - skipping discovery check';
        }

        // For OIDC, certificate is handled by the provider
        checks.certificate_valid = true;

      } else if (provider.protocol === 'saml') {
        checks.endpoints_configured = !!(config.entryPoint || config.ssoUrl);

        details.entry_point_provided = !!(config.entryPoint || config.ssoUrl);
        details.certificate_provided = !!(config.cert || config.certificate);

        // Check if the SAML entry point is reachable
        const ssoUrl = (config.entryPoint || config.ssoUrl) as string;
        if (ssoUrl) {
          try {
            const response = await fetch(ssoUrl, {
              method: 'HEAD',
              signal: AbortSignal.timeout(10000),
            });
            checks.metadata_reachable = response.ok || response.status === 405 || response.status === 302;
            details.sso_url_status = response.status;
          } catch (fetchError) {
            checks.metadata_reachable = false;
            details.sso_url_error = fetchError instanceof Error ? fetchError.message : 'Network error';
          }
        }

        // Check certificate format
        const certString = (config.cert || config.certificate) as string;
        if (certString) {
          checks.certificate_valid = certString.includes('BEGIN CERTIFICATE') ||
                                     certString.includes('BEGIN');
        } else {
          checks.certificate_valid = false;
        }
      }

      const allChecksPass = checks.endpoints_configured &&
                           (checks.metadata_reachable || provider.protocol === 'oidc') &&
                           checks.certificate_valid;

      return {
        success: allChecksPass,
        message: allChecksPass
          ? 'Connection test passed! Provider configuration looks good.'
          : 'Some checks failed. Please verify your configuration.',
        checks,
        details,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to test provider: ${error instanceof Error ? error.message : 'Unknown error'}`,
        checks: {
          metadata_reachable: false,
          certificate_valid: false,
          endpoints_configured: false,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const ssoProvidersController = new SsoProvidersController();
