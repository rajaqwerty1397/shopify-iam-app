import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ssoUsersService } from './sso-users.service.js';
import { storesService } from '../stores/stores.service.js';
import { z } from 'zod';
import { validateRequest } from '../../common/middleware/validate.js';
import { StoreNotFoundError } from '../../common/errors/index.js';

const idParamSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  storeId: z.string().uuid().optional(),
  ssoProviderId: z.string().uuid().optional(),
  status: z.enum(['active', 'blocked', 'pending']).optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

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
 * SSO Users Routes
 */
const ssoUsersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // List users (supports X-Shop-Domain header)
  fastify.get(
    '/',
    {
      schema: {
        tags: ['SSO Users'],
        summary: 'List SSO users',
        headers: {
          type: 'object',
          properties: {
            'x-shop-domain': { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
            storeId: { type: 'string', format: 'uuid' },
            ssoProviderId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['active', 'blocked', 'pending'] },
            search: { type: 'string' },
            sortBy: { type: 'string' },
            sortOrder: { type: 'string', enum: ['asc', 'desc'] },
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
          return reply.send({ users: [], total: 0, page: 1 });
        }
      }

      const result = await ssoUsersService.list(query);

      // Transform to frontend expected format
      return reply.send({
        users: result.data.map((u: any) => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          status: u.status,
          ssoProvider: u.ssoProviderId,
          lastLogin: u.lastLoginAt,
          loginCount: u.loginCount,
          createdAt: u.createdAt,
        })),
        total: result.total,
        page: result.page,
      });
    }
  );

  // Create user
  fastify.post(
    '/',
    {
      schema: {
        tags: ['SSO Users'],
        summary: 'Create SSO user',
        headers: {
          type: 'object',
          properties: {
            'x-shop-domain': { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            status: { type: 'string', enum: ['active', 'pending'] },
            organizationId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const domain = request.headers['x-shop-domain'] as string;
      const body = request.body as any;

      try {
        const store = await getStoreFromDomain(domain);
        const user = await ssoUsersService.create({
          storeId: store.id,
          email: body.email,
          firstName: body.firstName,
          lastName: body.lastName,
          status: body.status || 'pending',
        });
        return reply.status(201).send({ success: true, message: 'User created' });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Import users from CSV
  fastify.post(
    '/import-csv',
    {
      schema: {
        tags: ['SSO Users'],
        summary: 'Import users from CSV',
        headers: {
          type: 'object',
          properties: {
            'x-shop-domain': { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['csvData'],
          properties: {
            csvData: { type: 'string' },
            organizationId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const domain = request.headers['x-shop-domain'] as string;
      const body = request.body as any;

      try {
        const store = await getStoreFromDomain(domain);

        // Parse CSV and create users
        const lines = body.csvData.split('\n').filter((line: string) => line.trim());
        let created = 0;
        let skipped = 0;

        for (let i = 1; i < lines.length; i++) { // Skip header
          const [email, firstName, lastName] = lines[i].split(',').map((s: string) => s.trim());
          if (email) {
            try {
              await ssoUsersService.create({
                storeId: store.id,
                email,
                firstName: firstName || undefined,
                lastName: lastName || undefined,
                status: 'pending',
              });
              created++;
            } catch {
              skipped++;
            }
          }
        }

        return reply.send({ success: true, created, skipped });
      } catch (error: any) {
        return reply.status(500).send({ success: false, error: error.message });
      }
    }
  );

  // Get user by ID
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['SSO Users'],
        summary: 'Get SSO user by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: validateRequest({ params: idParamSchema }),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await ssoUsersService.findById(id);
      return reply.send(user);
    }
  );

  // Update user
  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['SSO Users'],
        summary: 'Update SSO user',
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
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            status: { type: 'string', enum: ['active', 'blocked', 'pending'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await ssoUsersService.update(id, request.body as Record<string, unknown>);
      return reply.send(user);
    }
  );

  // Block user
  fastify.post(
    '/:id/block',
    {
      schema: {
        tags: ['SSO Users'],
        summary: 'Block a user',
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
      const user = await ssoUsersService.block(id);
      return reply.send(user);
    }
  );

  // Unblock user
  fastify.post(
    '/:id/unblock',
    {
      schema: {
        tags: ['SSO Users'],
        summary: 'Unblock a user',
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
      const user = await ssoUsersService.unblock(id);
      return reply.send(user);
    }
  );
};

export default ssoUsersRoutes;
