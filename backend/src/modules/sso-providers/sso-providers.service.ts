import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import { encryptionService } from '../../services/encryption.service.js';
import {
  NotFoundError,
  ProviderNotConfiguredError,
} from '../../common/errors/index.js';
import {
  paginateResult,
  buildPrismaQuery,
  PaginationResult,
} from '../../common/utils/index.js';
import {
  CreateSsoProviderInput,
  UpdateSsoProviderInput,
  ListSsoProvidersQuery,
  SsoProviderPublic,
} from './sso-providers.schema.js';
import { SsoProvider, Prisma } from '@prisma/client';

const logger = createModuleLogger('SsoProvidersService');

/**
 * SSO Provider response without encrypted config
 */
export type SsoProviderPublicResponse = Omit<SsoProvider, 'config'>;

/**
 * SSO Providers Service
 *
 * Manages SSO provider configurations with encrypted credentials.
 */
export class SsoProvidersService {
  /**
   * Create a new SSO provider
   */
  async create(input: CreateSsoProviderInput): Promise<SsoProviderPublicResponse> {
    // Encrypt the config
    const encryptedConfig = encryptionService.encrypt(input.config);

    // If setting as default, unset other defaults for this store
    if (input.isDefault) {
      await prisma.ssoProvider.updateMany({
        where: { storeId: input.storeId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const provider = await prisma.ssoProvider.create({
      data: {
        storeId: input.storeId,
        providerType: input.providerType,
        protocol: input.protocol,
        displayName: input.displayName,
        iconUrl: input.iconUrl,
        displayOrder: input.displayOrder,
        isEnabled: input.isEnabled,
        isDefault: input.isDefault,
        buttonStyle: input.buttonStyle as Prisma.JsonObject,
        displayLocation: input.displayLocation as Prisma.JsonObject,
        config: encryptedConfig,
        scopeMappings: input.scopeMappings as Prisma.JsonObject,
        attributeMap: input.attributeMap as Prisma.JsonObject,
        status: 'active',
      },
    });

    logger.info(
      { providerId: provider.id, storeId: input.storeId, type: input.providerType },
      'SSO provider created'
    );

    const { config: _, ...publicResponse } = provider;
    return publicResponse;
  }

  /**
   * Get provider by ID (without config)
   */
  async findById(id: string): Promise<SsoProviderPublicResponse> {
    const provider = await prisma.ssoProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundError('SSO Provider');
    }

    const { config: _, ...publicResponse } = provider;
    return publicResponse;
  }

  /**
   * Get provider by ID with decrypted config
   */
  async findByIdWithConfig(id: string): Promise<SsoProvider & { decryptedConfig: Record<string, unknown> }> {
    const provider = await prisma.ssoProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundError('SSO Provider');
    }

    const decryptedConfig = encryptionService.decrypt<Record<string, unknown>>(provider.config);

    return { ...provider, decryptedConfig };
  }

  /**
   * Get provider by store ID and provider type with decrypted config
   */
  async findByStoreAndType(
    storeId: string,
    providerType: string
  ): Promise<SsoProvider & { decryptedConfig: Record<string, unknown> }> {
    const provider = await prisma.ssoProvider.findFirst({
      where: {
        storeId,
        providerType,
        isEnabled: true,
        status: 'active',
      },
    });

    if (!provider) {
      throw new ProviderNotConfiguredError(providerType);
    }

    const decryptedConfig = encryptionService.decrypt<Record<string, unknown>>(provider.config);

    return { ...provider, decryptedConfig };
  }

  /**
   * Get all enabled providers for a store (public data only)
   */
  async getStoreProviders(storeId: string): Promise<SsoProviderPublic[]> {
    const providers = await prisma.ssoProvider.findMany({
      where: {
        storeId,
        isEnabled: true,
        status: 'active',
      },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        providerType: true,
        protocol: true,
        displayName: true,
        iconUrl: true,
        displayOrder: true,
        buttonStyle: true,
      },
    });

    return providers as SsoProviderPublic[];
  }

  /**
   * Get default provider for a store
   */
  async getDefaultProvider(storeId: string): Promise<SsoProviderPublicResponse | null> {
    const provider = await prisma.ssoProvider.findFirst({
      where: {
        storeId,
        isDefault: true,
        isEnabled: true,
        status: 'active',
      },
    });

    if (!provider) return null;

    const { config: _, ...publicResponse } = provider;
    return publicResponse;
  }

  /**
   * List providers with pagination
   */
  async list(query: ListSsoProvidersQuery): Promise<PaginationResult<SsoProviderPublicResponse>> {
    const where: Prisma.SsoProviderWhereInput = {};

    if (query.storeId) {
      where.storeId = query.storeId;
    }

    if (query.protocol) {
      where.protocol = query.protocol;
    }

    if (query.providerType) {
      where.providerType = query.providerType;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.isEnabled !== undefined) {
      where.isEnabled = query.isEnabled;
    }

    const [providers, total] = await Promise.all([
      prisma.ssoProvider.findMany({
        where,
        ...buildPrismaQuery(
          { page: query.page, limit: query.limit },
          { sortBy: query.sortBy || 'displayOrder', sortOrder: query.sortOrder }
        ),
      }),
      prisma.ssoProvider.count({ where }),
    ]);

    // Remove config from response
    const providersWithoutConfig = providers.map(({ config: _, ...provider }) => provider);

    return paginateResult(providersWithoutConfig, total, { page: query.page, limit: query.limit });
  }

  /**
   * Update a provider
   */
  async update(id: string, input: UpdateSsoProviderInput): Promise<SsoProviderPublicResponse> {
    const existingProvider = await prisma.ssoProvider.findUnique({
      where: { id },
    });

    if (!existingProvider) {
      throw new NotFoundError('SSO Provider');
    }

    // If setting as default, unset other defaults for this store
    if (input.isDefault) {
      await prisma.ssoProvider.updateMany({
        where: { storeId: existingProvider.storeId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    // Encrypt config if provided
    let encryptedConfig: string | undefined;
    if (input.config) {
      encryptedConfig = encryptionService.encrypt(input.config);
    }

    const provider = await prisma.ssoProvider.update({
      where: { id },
      data: {
        ...(input.displayName && { displayName: input.displayName }),
        ...(input.iconUrl !== undefined && { iconUrl: input.iconUrl }),
        ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
        ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled }),
        ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
        ...(input.buttonStyle && { buttonStyle: input.buttonStyle as Prisma.JsonObject }),
        ...(input.displayLocation && { displayLocation: input.displayLocation as Prisma.JsonObject }),
        ...(encryptedConfig && { config: encryptedConfig }),
        ...(input.scopeMappings && { scopeMappings: input.scopeMappings as Prisma.JsonObject }),
        ...(input.attributeMap && { attributeMap: input.attributeMap as Prisma.JsonObject }),
        ...(input.status && { status: input.status }),
      },
    });

    logger.info({ providerId: id }, 'SSO provider updated');

    const { config: _, ...publicResponse } = provider;
    return publicResponse;
  }

  /**
   * Delete a provider
   */
  async delete(id: string): Promise<void> {
    const provider = await prisma.ssoProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundError('SSO Provider');
    }

    await prisma.ssoProvider.delete({
      where: { id },
    });

    logger.info({ providerId: id }, 'SSO provider deleted');
  }

  /**
   * Enable/disable a provider
   */
  async setEnabled(id: string, isEnabled: boolean): Promise<SsoProviderPublicResponse> {
    return this.update(id, { isEnabled });
  }

  /**
   * Set provider as default
   */
  async setDefault(id: string): Promise<SsoProviderPublicResponse> {
    return this.update(id, { isDefault: true });
  }
}

// Singleton instance
export const ssoProvidersService = new SsoProvidersService();
