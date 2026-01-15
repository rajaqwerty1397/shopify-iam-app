import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import { encryptionService } from '../../services/encryption.service.js';
import {
  NotFoundError,
  DuplicateResourceError,
  StoreNotFoundError,
} from '../../common/errors/index.js';
import {
  paginateResult,
  buildPrismaQuery,
  PaginationResult,
} from '../../common/utils/index.js';
import {
  CreateStoreInput,
  UpdateStoreInput,
  ListStoresQuery,
  StoreCredentials,
} from './stores.schema.js';
import { Store, Prisma } from '@prisma/client';

const logger = createModuleLogger('StoresService');

/**
 * Store response type (without credentials)
 */
export type StorePublicResponse = Omit<Store, 'credentials'>;

/**
 * Stores Service
 *
 * Handles store-related business logic with encrypted credentials.
 */
export class StoresService {
  /**
   * Create a new store with encrypted credentials
   */
  async create(input: CreateStoreInput): Promise<StorePublicResponse> {
    // Check for duplicate domain
    const existingDomain = await prisma.store.findUnique({
      where: { domain: input.domain },
    });

    if (existingDomain) {
      throw new DuplicateResourceError('Store with this domain already exists');
    }

    // Check for duplicate platformStoreId within appPlatform
    const existingStore = await prisma.store.findFirst({
      where: {
        appPlatformId: input.appPlatformId,
        platformStoreId: input.platformStoreId,
      },
    });

    if (existingStore) {
      throw new DuplicateResourceError('Store already installed for this app-platform');
    }

    // Encrypt credentials
    const credentials: StoreCredentials = {
      accessToken: input.accessToken,
      ...(input.multipassSecret && { multipassSecret: input.multipassSecret }),
    };
    const encryptedCredentials = encryptionService.encrypt(credentials);

    const store = await prisma.store.create({
      data: {
        appPlatformId: input.appPlatformId,
        platformStoreId: input.platformStoreId,
        domain: input.domain,
        name: input.name,
        ownerEmail: input.ownerEmail,
        credentials: encryptedCredentials,
        isPlus: input.isPlus,
        country: input.country,
        status: 'active',
        metadata: input.metadata as Prisma.JsonObject,
      },
    });

    logger.info({ storeId: store.id, domain: store.domain }, 'Store created');

    // Return without credentials
    const { credentials: _, ...storeResponse } = store;
    return storeResponse;
  }

  /**
   * Get store by ID (without credentials)
   */
  async findById(id: string): Promise<StorePublicResponse> {
    const store = await prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      throw new StoreNotFoundError();
    }

    const { credentials: _, ...storeResponse } = store;
    return storeResponse;
  }

  /**
   * Get store by ID with decrypted credentials
   */
  async findByIdWithCredentials(id: string): Promise<Store & { decryptedCredentials: StoreCredentials }> {
    const store = await prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      throw new StoreNotFoundError();
    }

    const decryptedCredentials = encryptionService.decrypt<StoreCredentials>(store.credentials);

    return { ...store, decryptedCredentials };
  }

  /**
   * Get store by domain
   */
  async findByDomain(domain: string): Promise<StorePublicResponse> {
    const store = await prisma.store.findUnique({
      where: { domain },
    });

    if (!store) {
      throw new StoreNotFoundError();
    }

    const { credentials: _, ...storeResponse } = store;
    return storeResponse;
  }

  /**
   * List stores with pagination
   */
  async list(query: ListStoresQuery): Promise<PaginationResult<StorePublicResponse>> {
    const where: Prisma.StoreWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.appPlatformId) {
      where.appPlatformId = query.appPlatformId;
    }

    if (query.isPlus !== undefined) {
      where.isPlus = query.isPlus;
    }

    if (query.search) {
      where.OR = [
        { domain: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { ownerEmail: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        ...buildPrismaQuery(
          { page: query.page, limit: query.limit },
          { sortBy: query.sortBy, sortOrder: query.sortOrder }
        ),
      }),
      prisma.store.count({ where }),
    ]);

    // Remove credentials from response
    const storesWithoutCredentials = stores.map(({ credentials: _, ...store }) => store);

    return paginateResult(storesWithoutCredentials, total, { page: query.page, limit: query.limit });
  }

  /**
   * Update a store
   */
  async update(id: string, input: UpdateStoreInput): Promise<StorePublicResponse> {
    // Verify store exists
    const existingStore = await prisma.store.findUnique({
      where: { id },
    });

    if (!existingStore) {
      throw new StoreNotFoundError();
    }

    // If updating credentials, encrypt them
    let credentialsUpdate: string | undefined;
    if (input.accessToken || input.multipassSecret !== undefined) {
      const currentCreds = encryptionService.decrypt<StoreCredentials>(existingStore.credentials);
      const newCredentials: StoreCredentials = {
        accessToken: input.accessToken || currentCreds.accessToken,
        ...(input.multipassSecret !== undefined && { multipassSecret: input.multipassSecret }),
        ...(input.multipassSecret === undefined &&
          currentCreds.multipassSecret && { multipassSecret: currentCreds.multipassSecret }),
      };
      credentialsUpdate = encryptionService.encrypt(newCredentials);
    }

    const store = await prisma.store.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.ownerEmail && { ownerEmail: input.ownerEmail }),
        ...(credentialsUpdate && { credentials: credentialsUpdate }),
        ...(input.isPlus !== undefined && { isPlus: input.isPlus }),
        ...(input.country && { country: input.country }),
        ...(input.status && { status: input.status }),
        ...(input.metadata !== undefined && { metadata: input.metadata as Prisma.JsonObject }),
      },
    });

    logger.info({ storeId: id }, 'Store updated');

    const { credentials: _, ...storeResponse } = store;
    return storeResponse;
  }

  /**
   * Delete a store (soft delete by setting status)
   */
  async delete(id: string): Promise<void> {
    const store = await prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      throw new StoreNotFoundError();
    }

    await prisma.store.update({
      where: { id },
      data: { status: 'uninstalled' },
    });

    logger.info({ storeId: id }, 'Store uninstalled');
  }

  /**
   * Hard delete a store (use with caution)
   */
  async hardDelete(id: string): Promise<void> {
    const store = await prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      throw new StoreNotFoundError();
    }

    await prisma.store.delete({
      where: { id },
    });

    logger.info({ storeId: id }, 'Store permanently deleted');
  }

  /**
   * Get store with subscription
   */
  async findByIdWithSubscription(id: string): Promise<StorePublicResponse & {
    subscription: {
      id: string;
      status: string;
      plan: { name: string; userLimit: number };
      currentUserCount: number;
    } | null;
  }> {
    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        subscription: {
          include: {
            plan: true,
          },
        },
      },
    });

    if (!store) {
      throw new StoreNotFoundError();
    }

    const { credentials: _, subscription, ...storeData } = store;

    return {
      ...storeData,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            plan: {
              name: subscription.plan.name,
              userLimit: subscription.plan.userLimit,
            },
            currentUserCount: subscription.currentUserCount,
          }
        : null,
    };
  }
}

// Singleton instance
export const storesService = new StoresService();
