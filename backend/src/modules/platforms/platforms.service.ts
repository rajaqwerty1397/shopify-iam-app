import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import {
  NotFoundError,
  DuplicateResourceError,
} from '../../common/errors/index.js';
import {
  CreatePlatformInput,
  UpdatePlatformInput,
  ListPlatformsQuery,
} from './platforms.schema.js';
import { Platform, Prisma } from '@prisma/client';

const logger = createModuleLogger('PlatformsService');

/**
 * Platforms Service
 *
 * Handles all platform-related business logic.
 */
export class PlatformsService {
  /**
   * Create a new platform
   */
  async create(input: CreatePlatformInput): Promise<Platform> {
    // Check for duplicate name
    const existing = await prisma.platform.findUnique({
      where: { name: input.name },
    });

    if (existing) {
      throw new DuplicateResourceError('Platform with this name already exists');
    }

    const platform = await prisma.platform.create({
      data: {
        name: input.name,
        status: 'ACTIVE', // Default status is always ACTIVE
        config: input.config as Prisma.JsonObject,
      },
    });

    logger.info({ platformId: platform.id, name: platform.name }, 'Platform created');
    return platform;
  }

  /**
   * Get platform by ID
   */
  async findById(id: number): Promise<Platform> {
    const platform = await prisma.platform.findUnique({
      where: { id },
    });

    if (!platform) {
      throw new NotFoundError('Platform');
    }

    return platform;
  }

  /**
   * Get platform by name
   */
  async findByName(name: string): Promise<Platform> {
    const platform = await prisma.platform.findUnique({
      where: { name },
    });

    if (!platform) {
      throw new NotFoundError('Platform');
    }

    return platform;
  }

  /**
   * List all platforms
   */
  async list(query: ListPlatformsQuery): Promise<Platform[]> {
    const where: Prisma.PlatformWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    return prisma.platform.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Update a platform
   */
  async update(id: number, input: UpdatePlatformInput): Promise<Platform> {
    // Verify platform exists
    await this.findById(id);

    const platform = await prisma.platform.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.status && { status: input.status }),
        ...(input.config !== undefined && { config: input.config as Prisma.JsonObject }),
      },
    });

    logger.info({ platformId: id }, 'Platform updated');
    return platform;
  }

  /**
   * Delete a platform
   */
  async delete(id: number): Promise<void> {
    // Verify platform exists
    await this.findById(id);

    await prisma.platform.delete({
      where: { id },
    });

    logger.info({ platformId: id }, 'Platform deleted');
  }

  /**
   * Get all active platforms
   */
  async getActivePlatforms(): Promise<Platform[]> {
    return prisma.platform.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  }
}

// Singleton instance
export const platformsService = new PlatformsService();
