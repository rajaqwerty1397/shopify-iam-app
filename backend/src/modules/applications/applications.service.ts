import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import {
  NotFoundError,
  DuplicateResourceError,
} from '../../common/errors/index.js';
import {
  CreateApplicationInput,
  UpdateApplicationInput,
  ListApplicationsQuery,
} from './applications.schema.js';
import { Application, Prisma } from '@prisma/client';

const logger = createModuleLogger('ApplicationsService');

/**
 * Applications Service
 *
 * Handles all application-related business logic.
 */
export class ApplicationsService {
  /**
   * Create a new application
   */
  async create(input: CreateApplicationInput): Promise<Application> {
    // Check for duplicate name
    const existing = await prisma.application.findUnique({
      where: { name: input.name },
    });

    if (existing) {
      throw new DuplicateResourceError('Application with this name already exists');
    }

    const application = await prisma.application.create({
      data: {
        name: input.name,
        description: input.description,
        iconUrl: input.iconUrl,
        status: 'ACTIVE',
        settings: input.settings as Prisma.JsonObject,
      },
    });

    logger.info({ applicationId: application.id, name: application.name }, 'Application created');
    return application;
  }

  /**
   * Get application by ID
   */
  async findById(id: number): Promise<Application> {
    const application = await prisma.application.findUnique({
      where: { id },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    return application;
  }

  /**
   * Get application by name
   */
  async findByName(name: string): Promise<Application> {
    const application = await prisma.application.findUnique({
      where: { name },
    });

    if (!application) {
      throw new NotFoundError('Application');
    }

    return application;
  }

  /**
   * List all applications
   */
  async list(query: ListApplicationsQuery): Promise<Application[]> {
    const where: Prisma.ApplicationWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    return prisma.application.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Update an application
   */
  async update(id: number, input: UpdateApplicationInput): Promise<Application> {
    // Verify application exists
    await this.findById(id);

    // Check for duplicate name if name is being updated
    if (input.name) {
      const existing = await prisma.application.findFirst({
        where: {
          name: input.name,
          id: { not: id },
        },
      });

      if (existing) {
        throw new DuplicateResourceError('Application with this name already exists');
      }
    }

    const application = await prisma.application.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.iconUrl !== undefined && { iconUrl: input.iconUrl }),
        ...(input.status && { status: input.status }),
        ...(input.settings !== undefined && { settings: input.settings as Prisma.JsonObject }),
      },
    });

    logger.info({ applicationId: id }, 'Application updated');
    return application;
  }

  /**
   * Delete an application
   */
  async delete(id: number): Promise<void> {
    // Verify application exists
    await this.findById(id);

    await prisma.application.delete({
      where: { id },
    });

    logger.info({ applicationId: id }, 'Application deleted');
  }

  /**
   * Get all active applications
   */
  async getActiveApplications(): Promise<Application[]> {
    return prisma.application.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  }
}

// Singleton instance
export const applicationsService = new ApplicationsService();
