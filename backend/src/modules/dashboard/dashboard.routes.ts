import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { dashboardService } from './dashboard.service.js';
import { storesService } from '../stores/stores.service.js';
import { StoreNotFoundError } from '../../common/errors/index.js';

/**
 * Dashboard Routes
 * 
 * Provides dashboard statistics and recent activity.
 * All routes require X-Shop-Domain header for store identification.
 */
const dashboardRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
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
   * GET /api/dashboard/stats
   * Returns statistics for the dashboard overview cards
   */
  fastify.get(
    '/stats',
    {
      schema: {
        tags: ['Dashboard'],
        summary: 'Get dashboard statistics',
        description: 'Returns aggregated statistics for the store dashboard',
        headers: {
          type: 'object',
          required: ['x-shop-domain'],
          properties: {
            'x-shop-domain': { type: 'string', description: 'Store domain (e.g., store.myshopify.com)' },
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
                  ssoProviders: { type: 'integer', description: 'Total configured SSO providers' },
                  activeProviders: { type: 'integer', description: 'Number of active providers' },
                  uniqueLogins: { type: 'integer', description: 'Unique users logged in this month' },
                  totalLogins: { type: 'integer', description: 'Total logins this month' },
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
      const stats = await dashboardService.getStats(store.id);

      return reply.send({
        success: true,
        data: stats,
      });
    }
  );

  /**
   * GET /api/dashboard/recent-logins
   * Returns recent login activity
   */
  fastify.get(
    '/recent-logins',
    {
      schema: {
        tags: ['Dashboard'],
        summary: 'Get recent login activity',
        description: 'Returns the most recent SSO login attempts',
        headers: {
          type: 'object',
          required: ['x-shop-domain'],
          properties: {
            'x-shop-domain': { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', default: 5, minimum: 1, maximum: 50 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string', nullable: true },
                    provider: { type: 'string', nullable: true },
                    status: { type: 'string', enum: ['success', 'failed'] },
                    timestamp: { type: 'string', format: 'date-time' },
                    ipAddress: { type: 'string', nullable: true },
                    errorMessage: { type: 'string', nullable: true },
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
      const { limit } = request.query as { limit?: number };
      
      const store = await getStoreFromDomain(domain);
      const recentLogins = await dashboardService.getRecentLogins(store.id, limit);

      return reply.send({
        success: true,
        data: recentLogins,
      });
    }
  );
};

export default dashboardRoutes;
