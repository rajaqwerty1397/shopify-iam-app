import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { insightsService } from './insights.service.js';
import { storesService } from '../stores/stores.service.js';
import { StoreNotFoundError } from '../../common/errors/index.js';

/**
 * Insights Routes
 *
 * Provides AI-powered analytics and insights for SSO data.
 * All routes require X-Shop-Domain header for store identification.
 */
const insightsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
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
   * GET /api/insights
   * Returns AI-generated insights and analytics
   */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Insights'],
        summary: 'Get AI-powered insights',
        description: 'Returns AI-generated insights and analytics for your SSO setup using Groq Llama model',
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
                  summary: { type: 'string', description: 'AI-generated summary of SSO health' },
                  insights: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        type: { type: 'string', enum: ['security', 'optimization', 'trend', 'alert', 'recommendation'] },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                        metric: { type: 'string', nullable: true },
                        action: { type: 'string', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                  analytics: {
                    type: 'object',
                    properties: {
                      totalUsers: { type: 'integer' },
                      activeUsers: { type: 'integer' },
                      pendingUsers: { type: 'integer' },
                      suspendedUsers: { type: 'integer' },
                      totalProviders: { type: 'integer' },
                      activeProviders: { type: 'integer' },
                      totalLogins: { type: 'integer' },
                      successfulLogins: { type: 'integer' },
                      failedLogins: { type: 'integer' },
                      loginsByProvider: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            provider: { type: 'string' },
                            count: { type: 'integer' },
                          },
                        },
                      },
                      loginsByDay: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            date: { type: 'string' },
                            success: { type: 'integer' },
                            failed: { type: 'integer' },
                          },
                        },
                      },
                      topUsers: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            email: { type: 'string' },
                            loginCount: { type: 'integer' },
                          },
                        },
                      },
                      organizations: { type: 'integer' },
                      domains: { type: 'integer' },
                      verifiedDomains: { type: 'integer' },
                      recentErrors: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            error: { type: 'string' },
                            count: { type: 'integer' },
                          },
                        },
                      },
                    },
                  },
                  generatedAt: { type: 'string', format: 'date-time' },
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
      const insights = await insightsService.generateInsights(store.id);

      return reply.send({
        success: true,
        data: insights,
      });
    }
  );

  /**
   * GET /api/insights/analytics
   * Returns raw analytics data without AI analysis
   */
  fastify.get(
    '/analytics',
    {
      schema: {
        tags: ['Insights'],
        summary: 'Get raw analytics data',
        description: 'Returns raw analytics data without AI analysis',
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
              data: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const domain = request.headers['x-shop-domain'] as string;
      const store = await getStoreFromDomain(domain);
      const analytics = await insightsService.collectAnalyticsData(store.id);

      return reply.send({
        success: true,
        data: analytics,
      });
    }
  );

  /**
   * POST /api/insights/refresh
   * Clears cache and regenerates insights
   */
  fastify.post(
    '/refresh',
    {
      schema: {
        tags: ['Insights'],
        summary: 'Refresh insights',
        description: 'Clears the cache and regenerates AI insights',
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
              data: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const domain = request.headers['x-shop-domain'] as string;
      const store = await getStoreFromDomain(domain);

      // Clear cache
      await insightsService.clearCache(store.id);

      // Regenerate insights
      const insights = await insightsService.generateInsights(store.id);

      return reply.send({
        success: true,
        data: insights,
      });
    }
  );
};

export default insightsRoutes;
