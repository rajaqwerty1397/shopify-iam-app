import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { storesController } from './stores.controller.js';
import { validateRequest } from '../../common/middleware/validate.js';
import {
  createStoreSchema,
  updateStoreSchema,
  listStoresQuerySchema,
  storeIdParamSchema,
} from './stores.schema.js';

/**
 * Stores Routes
 */
const storesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Create store
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Stores'],
        summary: 'Create a new store installation',
        body: {
          type: 'object',
          required: ['appPlatformId', 'platformStoreId', 'domain', 'name', 'ownerEmail', 'accessToken'],
          properties: {
            appPlatformId: { type: 'string', format: 'uuid' },
            platformStoreId: { type: 'string' },
            domain: { type: 'string' },
            name: { type: 'string' },
            ownerEmail: { type: 'string', format: 'email' },
            accessToken: { type: 'string' },
            multipassSecret: { type: 'string' },
            isPlus: { type: 'boolean', default: false },
            country: { type: 'string' },
            metadata: { type: 'object' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              appPlatformId: { type: 'string', format: 'uuid' },
              platformStoreId: { type: 'string' },
              domain: { type: 'string' },
              name: { type: 'string' },
              ownerEmail: { type: 'string' },
              isPlus: { type: 'boolean' },
              country: { type: 'string', nullable: true },
              status: { type: 'string' },
              metadata: { type: 'object', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      preHandler: validateRequest({ body: createStoreSchema }),
    },
    storesController.create.bind(storesController)
  );

  // List stores
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Stores'],
        summary: 'List all stores',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
            status: { type: 'string', enum: ['active', 'paused', 'uninstalled', 'suspended'] },
            appPlatformId: { type: 'string', format: 'uuid' },
            isPlus: { type: 'boolean' },
            search: { type: 'string' },
            sortBy: { type: 'string' },
            sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
      },
      preHandler: validateRequest({ query: listStoresQuerySchema }),
    },
    storesController.list.bind(storesController)
  );

  // Get store by ID
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Stores'],
        summary: 'Get store by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: validateRequest({ params: storeIdParamSchema }),
    },
    storesController.findById.bind(storesController)
  );

  // Get store with subscription
  fastify.get(
    '/:id/subscription',
    {
      schema: {
        tags: ['Stores'],
        summary: 'Get store with subscription details',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: validateRequest({ params: storeIdParamSchema }),
    },
    storesController.findByIdWithSubscription.bind(storesController)
  );

  // Update store
  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['Stores'],
        summary: 'Update a store',
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
            ownerEmail: { type: 'string', format: 'email' },
            accessToken: { type: 'string' },
            multipassSecret: { type: 'string' },
            isPlus: { type: 'boolean' },
            country: { type: 'string' },
            status: { type: 'string', enum: ['active', 'paused', 'uninstalled', 'suspended'] },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: validateRequest({
        params: storeIdParamSchema,
        body: updateStoreSchema,
      }),
    },
    storesController.update.bind(storesController)
  );

  // Delete (uninstall) store
  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Stores'],
        summary: 'Uninstall a store',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          204: { type: 'null' },
        },
      },
      preHandler: validateRequest({ params: storeIdParamSchema }),
    },
    storesController.delete.bind(storesController)
  );
};

export default storesRoutes;
