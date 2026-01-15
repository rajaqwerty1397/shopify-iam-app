import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { platformsController } from './platforms.controller.js';
import { validateRequest } from '../../common/middleware/validate.js';
import {
  createPlatformSchema,
  updatePlatformSchema,
  listPlatformsQuerySchema,
  platformIdParamSchema,
} from './platforms.schema.js';

/**
 * Platforms Routes
 *
 * @swagger
 * tags:
 *   name: Platforms
 *   description: Platform management (Shopify, WooCommerce, etc.)
 */
const platformsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * @swagger
   * /api/platforms:
   *   post:
   *     summary: Create a new platform
   *     tags: [Platforms]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *             properties:
   *               name:
   *                 type: string
   *                 example: Shopify
   *               config:
   *                 type: object
   *     responses:
   *       201:
   *         description: Platform created successfully (status defaults to active)
   *       409:
   *         description: Platform with this name already exists
   */
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Platforms'],
        summary: 'Create a new platform',
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            config: { type: 'object', additionalProperties: true },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              status: { type: 'string' },
              config: { type: 'object', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      preHandler: validateRequest({ body: createPlatformSchema }),
    },
    platformsController.create.bind(platformsController)
  );

  /**
   * @swagger
   * /api/platforms:
   *   get:
   *     summary: List all platforms
   *     tags: [Platforms]
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [active, beta, deprecated, disabled]
   *     responses:
   *       200:
   *         description: List of platforms
   */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Platforms'],
        summary: 'List all platforms',
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                name: { type: 'string' },
                status: { type: 'string' },
                config: { type: 'object', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      preHandler: validateRequest({ query: listPlatformsQuerySchema }),
    },
    platformsController.list.bind(platformsController)
  );

  /**
   * @swagger
   * /api/platforms/{id}:
   *   get:
   *     summary: Get platform by ID
   *     tags: [Platforms]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Platform details
   *       404:
   *         description: Platform not found
   */
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Platforms'],
        summary: 'Get platform by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              status: { type: 'string' },
              config: { type: 'object', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      preHandler: validateRequest({ params: platformIdParamSchema }),
    },
    platformsController.findById.bind(platformsController)
  );

  /**
   * @swagger
   * /api/platforms/{id}:
   *   patch:
   *     summary: Update a platform
   *     tags: [Platforms]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               status:
   *                 type: string
   *               config:
   *                 type: object
   *     responses:
   *       200:
   *         description: Platform updated
   *       404:
   *         description: Platform not found
   */
  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['Platforms'],
        summary: 'Update a platform',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
            config: { type: 'object', additionalProperties: true },
          },
        },
      },
      preHandler: validateRequest({
        params: platformIdParamSchema,
        body: updatePlatformSchema,
      }),
    },
    platformsController.update.bind(platformsController)
  );

  /**
   * @swagger
   * /api/platforms/{id}:
   *   delete:
   *     summary: Delete a platform
   *     tags: [Platforms]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       204:
   *         description: Platform deleted
   *       404:
   *         description: Platform not found
   */
  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Platforms'],
        summary: 'Delete a platform',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' },
          },
        },
        response: {
          204: {
            type: 'null',
            description: 'Platform deleted successfully',
          },
        },
      },
      preHandler: validateRequest({ params: platformIdParamSchema }),
    },
    platformsController.delete.bind(platformsController)
  );
};

export default platformsRoutes;
