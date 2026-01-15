import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { billingService } from './billing.service.js';
import { storesService } from '../stores/stores.service.js';
import { StoreNotFoundError } from '../../common/errors/index.js';
import { config } from '../../config/index.js';

/**
 * Billing Routes
 * 
 * Provides billing and plan information.
 */
const billingRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
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
   * GET /api/billing/plan
   * Get current plan information
   */
  fastify.get(
    '/plan',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Get current plan',
        description: 'Returns the current subscription plan and usage for the store',
        headers: {
          type: 'object',
          required: ['x-shop-domain'],
          properties: {
            'x-shop-domain': { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  plan: { type: 'string' },
                  planName: { type: 'string' },
                  features: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  limits: {
                    type: 'object',
                    properties: {
                      providers: { type: 'integer' },
                      uniqueLogins: { type: 'integer' },
                    },
                  },
                  usage: {
                    type: 'object',
                    properties: {
                      providers: { type: 'integer' },
                      uniqueLogins: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const domain = request.headers['x-shop-domain'] as string;
      const store = await getStoreFromDomain(domain);
      const planInfo = await billingService.getCurrentPlan(store.id);

      return reply.send({
        success: true,
        data: planInfo,
      });
    }
  );

  /**
   * POST /api/billing/upgrade
   * Upgrade subscription plan
   */
  fastify.post(
    '/upgrade',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Upgrade subscription plan',
        description: 'Creates a Shopify billing charge for plan upgrade',
        headers: {
          type: 'object',
          required: ['x-shop-domain'],
          properties: {
            'x-shop-domain': { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['planId'],
          properties: {
            planId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  confirmationUrl: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const domain = request.headers['x-shop-domain'] as string;
      const { planId } = request.body as { planId: string };
      const store = await getStoreFromDomain(domain);

      const result = await billingService.upgradePlan(store.id, planId);

      return reply.send({
        success: true,
        data: result,
      });
    }
  );
};

export default billingRoutes;
