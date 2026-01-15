import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { onboardingService, OnboardingStep } from './onboarding.service.js';
import { storesService } from '../stores/stores.service.js';
import { StoreNotFoundError, ValidationError } from '../../common/errors/index.js';

/**
 * Onboarding & Settings Routes
 * 
 * Manages store onboarding status and settings.
 */
const onboardingRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * Get store from domain header
   */
  async function getStoreFromDomain(domain: string | undefined) {
    if (!domain) {
      throw new StoreNotFoundError('X-Shop-Domain header is required');
    }
    return storesService.findByDomain(domain);
  }

  // ==========================================================================
  // ONBOARDING ENDPOINTS
  // ==========================================================================

  /**
   * GET /api/onboarding/status
   * Returns the onboarding/setup completion status for the store
   */
  fastify.get(
    '/status',
    {
      schema: {
        tags: ['Onboarding'],
        summary: 'Get onboarding status',
        description: 'Returns the onboarding/setup completion status for the store',
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
                  hasProvider: { type: 'boolean' },
                  hasUsers: { type: 'boolean' },
                  hasEnabledAppEmbed: { type: 'boolean' },
                  completedSteps: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  showTour: { type: 'boolean' },
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
      const status = await onboardingService.getStatus(store.id);

      return reply.send({
        success: true,
        data: status,
      });
    }
  );

  /**
   * POST /api/onboarding/complete-step
   * Mark an onboarding step as completed
   */
  fastify.post(
    '/complete-step',
    {
      schema: {
        tags: ['Onboarding'],
        summary: 'Complete onboarding step',
        description: 'Mark an onboarding step as completed',
        headers: {
          type: 'object',
          required: ['x-shop-domain'],
          properties: {
            'x-shop-domain': { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['step'],
          properties: {
            step: {
              type: 'string',
              enum: ['provider', 'app_embed', 'tour_completed'],
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const domain = request.headers['x-shop-domain'] as string;
      const { step } = request.body as { step: OnboardingStep };

      const validSteps: OnboardingStep[] = ['provider', 'app_embed', 'tour_completed'];
      if (!validSteps.includes(step)) {
        throw new ValidationError(`Invalid step. Must be one of: ${validSteps.join(', ')}`);
      }

      const store = await getStoreFromDomain(domain);
      await onboardingService.completeStep(store.id, step);

      return reply.send({
        success: true,
      });
    }
  );

  // ==========================================================================
  // SETTINGS ENDPOINTS
  // ==========================================================================

  /**
   * GET /api/settings
   * Get store settings
   */
  fastify.get(
    '/settings',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Get store settings',
        description: 'Returns the SSO settings for the store',
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
                  ssoEnabled: { type: 'boolean' },
                  autoRedirectToIdp: { type: 'boolean' },
                  sessionTimeout: { type: 'string' },
                  ssoButtonSettings: {
                    type: 'object',
                    properties: {
                      enableSso: { type: 'boolean' },
                      ssoText: { type: 'string' },
                      enableGoogle: { type: 'boolean' },
                      enableMicrosoft: { type: 'boolean' },
                      buttonColor: { type: 'string' },
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
      const settings = await onboardingService.getSettings(store.id);

      return reply.send({
        success: true,
        data: settings,
      });
    }
  );

  /**
   * PUT /api/settings
   * Update store settings
   */
  fastify.put(
    '/settings',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Update store settings',
        description: 'Update the SSO settings for the store',
        headers: {
          type: 'object',
          required: ['x-shop-domain'],
          properties: {
            'x-shop-domain': { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            ssoEnabled: { type: 'boolean' },
            autoRedirectToIdp: { type: 'boolean' },
            sessionTimeout: { type: 'string' },
            ssoButtonSettings: {
              type: 'object',
              properties: {
                enableSso: { type: 'boolean' },
                ssoText: { type: 'string' },
                enableGoogle: { type: 'boolean' },
                enableMicrosoft: { type: 'boolean' },
                buttonColor: { type: 'string' },
              },
            },
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
                  ssoEnabled: { type: 'boolean' },
                  autoRedirectToIdp: { type: 'boolean' },
                  sessionTimeout: { type: 'string' },
                  ssoButtonSettings: {
                    type: 'object',
                    properties: {
                      enableSso: { type: 'boolean' },
                      ssoText: { type: 'string' },
                      enableGoogle: { type: 'boolean' },
                      enableMicrosoft: { type: 'boolean' },
                      buttonColor: { type: 'string' },
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
      const body = request.body as {
        ssoEnabled?: boolean;
        autoRedirectToIdp?: boolean;
        sessionTimeout?: string;
        ssoButtonSettings?: {
          enableSso?: boolean;
          ssoText?: string;
          enableGoogle?: boolean;
          enableMicrosoft?: boolean;
          buttonColor?: string;
        };
      };

      const store = await getStoreFromDomain(domain);
      const settings = await onboardingService.updateSettings(store.id, body);

      return reply.send({
        success: true,
        data: settings,
      });
    }
  );
};

export default onboardingRoutes;
