import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { applicationsController } from './applications.controller.js';
import { validateRequest } from '../../common/middleware/validate.js';
import {
  createApplicationSchema,
  updateApplicationSchema,
  listApplicationsQuerySchema,
  applicationIdParamSchema,
} from './applications.schema.js';

/**
 * Applications Routes
 *
 * @swagger
 * tags:
 *   name: Applications
 *   description: Application management (SSO, Reviews, Loyalty, etc.)
 */
const applicationsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * @swagger
   * /api/applications:
   *   post:
   *     summary: Create a new application
   *     tags: [Applications]
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
   *                 example: Persona SSO
   *               description:
   *                 type: string
   *               iconUrl:
   *                 type: string
   *               settings:
   *                 type: object
   *     responses:
   *       201:
   *         description: Application created successfully (status defaults to ACTIVE)
   *       409:
   *         description: Application with this name already exists
   */
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Applications'],
        summary: 'Create a new application',
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 1000 },
            iconUrl: { type: 'string', format: 'uri', maxLength: 500 },
            settings: { type: 'object', additionalProperties: true },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              iconUrl: { type: 'string', nullable: true },
              status: { type: 'string' },
              settings: { type: 'object', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      preHandler: validateRequest({ body: createApplicationSchema }),
    },
    applicationsController.create.bind(applicationsController)
  );

  /**
   * @swagger
   * /api/applications:
   *   get:
   *     summary: List all applications
   *     tags: [Applications]
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [ACTIVE, INACTIVE]
   *     responses:
   *       200:
   *         description: List of applications
   */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Applications'],
        summary: 'List all applications',
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
                description: { type: 'string', nullable: true },
                iconUrl: { type: 'string', nullable: true },
                status: { type: 'string' },
                settings: { type: 'object', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      preHandler: validateRequest({ query: listApplicationsQuerySchema }),
    },
    applicationsController.list.bind(applicationsController)
  );

  /**
   * @swagger
   * /api/applications/{id}:
   *   get:
   *     summary: Get application by ID
   *     tags: [Applications]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Application details
   *       404:
   *         description: Application not found
   */
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Applications'],
        summary: 'Get application by ID',
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
              description: { type: 'string', nullable: true },
              iconUrl: { type: 'string', nullable: true },
              status: { type: 'string' },
              settings: { type: 'object', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      preHandler: validateRequest({ params: applicationIdParamSchema }),
    },
    applicationsController.findById.bind(applicationsController)
  );

  /**
   * @swagger
   * /api/applications/{id}:
   *   patch:
   *     summary: Update an application
   *     tags: [Applications]
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
   *               description:
   *                 type: string
   *               iconUrl:
   *                 type: string
   *               status:
   *                 type: string
   *               settings:
   *                 type: object
   *     responses:
   *       200:
   *         description: Application updated
   *       404:
   *         description: Application not found
   */
  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['Applications'],
        summary: 'Update an application',
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
            description: { type: 'string', maxLength: 1000, nullable: true },
            iconUrl: { type: 'string', format: 'uri', maxLength: 500, nullable: true },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
            settings: { type: 'object', additionalProperties: true, nullable: true },
          },
        },
      },
      preHandler: validateRequest({
        params: applicationIdParamSchema,
        body: updateApplicationSchema,
      }),
    },
    applicationsController.update.bind(applicationsController)
  );

  /**
   * @swagger
   * /api/applications/{id}:
   *   delete:
   *     summary: Delete an application
   *     tags: [Applications]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       204:
   *         description: Application deleted
   *       404:
   *         description: Application not found
   */
  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Applications'],
        summary: 'Delete an application',
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
            description: 'Application deleted successfully',
          },
        },
      },
      preHandler: validateRequest({ params: applicationIdParamSchema }),
    },
    applicationsController.delete.bind(applicationsController)
  );
};

export default applicationsRoutes;
