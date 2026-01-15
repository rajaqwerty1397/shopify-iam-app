import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import { passwordService } from '../../services/password.service.js';
import { encryptionService } from '../../services/encryption.service.js';
import {
  NotFoundError,
  UserBlockedError,
  UserLimitExceededError,
} from '../../common/errors/index.js';
import {
  paginateResult,
  buildPrismaQuery,
  PaginationResult,
} from '../../common/utils/index.js';
import { SsoUser, Prisma } from '@prisma/client';

const logger = createModuleLogger('SsoUsersService');

/**
 * Create SSO User Input
 */
export interface CreateSsoUserInput {
  storeId: string;
  ssoProviderId: string;
  idpCustomerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  platformCustomerId?: string;
  profileData?: Record<string, unknown>;
}

/**
 * Update SSO User Input
 */
export interface UpdateSsoUserInput {
  firstName?: string;
  lastName?: string;
  platformCustomerId?: string;
  profileData?: Record<string, unknown>;
  status?: 'active' | 'blocked' | 'pending';
}

/**
 * List SSO Users Query
 */
export interface ListSsoUsersQuery {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  storeId?: string;
  ssoProviderId?: string;
  status?: string;
  search?: string;
}

/**
 * SSO Users Service
 */
export class SsoUsersService {
  /**
   * Create or update an SSO user
   */
  async upsert(input: CreateSsoUserInput, storeDomain: string): Promise<SsoUser> {
    // Check if user exists
    const existingUser = await prisma.ssoUser.findFirst({
      where: {
        storeId: input.storeId,
        ssoProviderId: input.ssoProviderId,
        idpCustomerId: input.idpCustomerId,
      },
    });

    if (existingUser) {
      // Update existing user
      return this.updateLoginInfo(existingUser.id, input);
    }

    // Check user limit before creating new user
    await this.checkUserLimit(input.storeId);

    // Generate password hash for non-Plus stores
    const password = passwordService.generatePassword(storeDomain, input.idpCustomerId);
    const passwordHash = passwordService.hashPassword(password, storeDomain);

    // Create new user
    const user = await prisma.ssoUser.create({
      data: {
        storeId: input.storeId,
        ssoProviderId: input.ssoProviderId,
        idpCustomerId: input.idpCustomerId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        platformCustomerId: input.platformCustomerId,
        passwordHash,
        profileData: input.profileData as Prisma.JsonObject,
        lastLoginAt: new Date(),
        loginCount: 1,
        status: 'active',
      },
    });

    // Increment user count in subscription
    await this.incrementUserCount(input.storeId);

    logger.info({ userId: user.id, storeId: input.storeId }, 'SSO user created');
    return user;
  }

  /**
   * Update user info on login
   */
  private async updateLoginInfo(userId: string, input: CreateSsoUserInput): Promise<SsoUser> {
    const user = await prisma.ssoUser.update({
      where: { id: userId },
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        profileData: input.profileData as Prisma.JsonObject,
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
    });

    return user;
  }

  /**
   * Check if store has reached user limit
   */
  private async checkUserLimit(storeId: string): Promise<void> {
    const subscription = await prisma.subscription.findUnique({
      where: { storeId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new UserLimitExceededError(0);
    }

    const { userLimit } = subscription.plan;

    // -1 means unlimited
    if (userLimit === -1) return;

    if (subscription.currentUserCount >= userLimit) {
      throw new UserLimitExceededError(userLimit);
    }
  }

  /**
   * Increment user count in subscription
   */
  private async incrementUserCount(storeId: string): Promise<void> {
    await prisma.subscription.update({
      where: { storeId },
      data: { currentUserCount: { increment: 1 } },
    });
  }

  /**
   * Get user by ID
   */
  async findById(id: string): Promise<SsoUser> {
    const user = await prisma.ssoUser.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError('SSO User');
    }

    return user;
  }

  /**
   * Get user by email for a store
   */
  async findByEmail(storeId: string, email: string): Promise<SsoUser | null> {
    return prisma.ssoUser.findFirst({
      where: { storeId, email },
    });
  }

  /**
   * Get user by IdP ID
   */
  async findByIdpId(
    storeId: string,
    ssoProviderId: string,
    idpCustomerId: string
  ): Promise<SsoUser | null> {
    return prisma.ssoUser.findFirst({
      where: { storeId, ssoProviderId, idpCustomerId },
    });
  }

  /**
   * List users with pagination
   */
  async list(query: ListSsoUsersQuery): Promise<PaginationResult<SsoUser>> {
    const where: Prisma.SsoUserWhereInput = {};

    if (query.storeId) {
      where.storeId = query.storeId;
    }

    if (query.ssoProviderId) {
      where.ssoProviderId = query.ssoProviderId;
    }

    if (query.status) {
      where.status = query.status as 'active' | 'blocked' | 'pending';
    }

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.ssoUser.findMany({
        where,
        ...buildPrismaQuery(
          { page: query.page, limit: query.limit },
          { sortBy: query.sortBy || 'lastLoginAt', sortOrder: query.sortOrder }
        ),
      }),
      prisma.ssoUser.count({ where }),
    ]);

    return paginateResult(users, total, { page: query.page, limit: query.limit });
  }

  /**
   * Update a user
   */
  async update(id: string, input: UpdateSsoUserInput): Promise<SsoUser> {
    const user = await this.findById(id);

    return prisma.ssoUser.update({
      where: { id },
      data: {
        ...(input.firstName && { firstName: input.firstName }),
        ...(input.lastName && { lastName: input.lastName }),
        ...(input.platformCustomerId && { platformCustomerId: input.platformCustomerId }),
        ...(input.profileData && { profileData: input.profileData as Prisma.JsonObject }),
        ...(input.status && { status: input.status }),
      },
    });
  }

  /**
   * Block a user
   */
  async block(id: string): Promise<SsoUser> {
    return this.update(id, { status: 'blocked' });
  }

  /**
   * Unblock a user
   */
  async unblock(id: string): Promise<SsoUser> {
    return this.update(id, { status: 'active' });
  }

  /**
   * Get generated password for a user
   */
  getGeneratedPassword(storeDomain: string, idpCustomerId: string): string {
    return passwordService.generatePassword(storeDomain, idpCustomerId);
  }

  /**
   * Get user count for a store
   */
  async getUserCount(storeId: string): Promise<number> {
    return prisma.ssoUser.count({
      where: { storeId, status: 'active' },
    });
  }
}

// Singleton instance
export const ssoUsersService = new SsoUsersService();
