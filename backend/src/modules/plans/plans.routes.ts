import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { plansController } from './plans.controller.js';
import { validateRequest } from '../../common/middleware/validate.js';
import {
  createPlanSchema,
  updatePlanSchema,
  listPlansQuerySchema,
  planIdParamSchema,
} from './plans.schema.js';

/**
 * Plans Routes
 *
 * @swagger
 * tags:
 *   name: Plans
 *   description: Subscription plan management
 */
const plansRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * @swagger
   * /api/plans:
   *   post:
   *     summary: Create a new plan
   *     tags: [Plans]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - appPlatformId
   *               - name
   *             properties:
   *               appPlatformId:
   *                 type: string
   *                 format: uuid
   *               name:
   *                 type: string
   *                 example: Pro
   *               description:
   *                 type: string
   *               monthlyPrice:
   *                 type: number
   *               annualPrice:
   *                 type: number
   *               userLimit:
   *                 type: integer
   *               features:
   *                 type: object
   *               trialDays:
   *                 type: integer
   *               isActive:
   *                 type: boolean
   *               displayOrder:
   *                 type: integer
   *     responses:
   *       201:
   *         description: Plan created successfully
   *       404:
   *         description: AppPlatform not found
   *       409:
   *         description: Plan with this name already exists
   */
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Plans'],
        summary: 'Create a new plan',
        body: {
          type: 'object',
          required: ['appPlatformId', 'name'],
          properties: {
            appPlatformId: { type: 'integer' },
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 1000 },
            monthlyPrice: { type: 'number', minimum: 0, default: 0 },
            annualPrice: { type: 'number', minimum: 0, default: 0 },
            userLimit: { type: 'integer', default: -1 },
            features: { type: 'object', additionalProperties: true },
            trialDays: { type: 'integer', minimum: 0, default: 0 },
            isActive: { type: 'boolean', default: true },
            displayOrder: { type: 'integer', default: 0 },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              appPlatformId: { type: 'integer' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              monthlyPrice: { type: 'number' },
              annualPrice: { type: 'number' },
              userLimit: { type: 'integer' },
              features: { type: 'object', nullable: true },
              trialDays: { type: 'integer' },
              isActive: { type: 'boolean' },
              displayOrder: { type: 'integer' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      preHandler: validateRequest({ body: createPlanSchema }),
    },
    plansController.create.bind(plansController)
  );

  /**
   * @swagger
   * /api/plans:
   *   get:
   *     summary: List all plans
   *     tags: [Plans]
   *     parameters:
   *       - in: query
   *         name: appPlatformId
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: isActive
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: List of plans
   */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Plans'],
        summary: 'List all plans',
        querystring: {
          type: 'object',
          properties: {
            appPlatformId: { type: 'integer' },
            isActive: { type: 'boolean' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                appPlatformId: { type: 'integer' },
                name: { type: 'string' },
                description: { type: 'string', nullable: true },
                monthlyPrice: { type: 'number' },
                annualPrice: { type: 'number' },
                userLimit: { type: 'integer' },
                features: { type: 'object', nullable: true },
                trialDays: { type: 'integer' },
                isActive: { type: 'boolean' },
                displayOrder: { type: 'integer' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      preHandler: validateRequest({ query: listPlansQuerySchema }),
    },
    plansController.list.bind(plansController)
  );

  /**
   * @swagger
   * /api/plans/{id}:
   *   get:
   *     summary: Get plan by ID
   *     tags: [Plans]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Plan details
   *       404:
   *         description: Plan not found
   */
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Plans'],
        summary: 'Get plan by ID',
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
              appPlatformId: { type: 'integer' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              monthlyPrice: { type: 'number' },
              annualPrice: { type: 'number' },
              userLimit: { type: 'integer' },
              features: { type: 'object', nullable: true },
              trialDays: { type: 'integer' },
              isActive: { type: 'boolean' },
              displayOrder: { type: 'integer' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      preHandler: validateRequest({ params: planIdParamSchema }),
    },
    plansController.findById.bind(plansController)
  );

  /**
   * @swagger
   * /api/plans/{id}:
   *   patch:
   *     summary: Update a plan
   *     tags: [Plans]
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
   *               monthlyPrice:
   *                 type: number
   *               annualPrice:
   *                 type: number
   *               userLimit:
   *                 type: integer
   *               features:
   *                 type: object
   *               trialDays:
   *                 type: integer
   *               isActive:
   *                 type: boolean
   *               displayOrder:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Plan updated
   *       404:
   *         description: Plan not found
   */
  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['Plans'],
        summary: 'Update a plan',
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
            monthlyPrice: { type: 'number', minimum: 0 },
            annualPrice: { type: 'number', minimum: 0 },
            userLimit: { type: 'integer' },
            features: { type: 'object', additionalProperties: true, nullable: true },
            trialDays: { type: 'integer', minimum: 0 },
            isActive: { type: 'boolean' },
            displayOrder: { type: 'integer' },
          },
        },
      },
      preHandler: validateRequest({
        params: planIdParamSchema,
        body: updatePlanSchema,
      }),
    },
    plansController.update.bind(plansController)
  );

  /**
   * @swagger
   * /api/plans/{id}:
   *   delete:
   *     summary: Delete a plan
   *     tags: [Plans]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       204:
   *         description: Plan deleted
   *       404:
   *         description: Plan not found
   */
  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Plans'],
        summary: 'Delete a plan',
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
            description: 'Plan deleted successfully',
          },
        },
      },
      preHandler: validateRequest({ params: planIdParamSchema }),
    },
    plansController.delete.bind(plansController)
  );
};

export default plansRoutes;
