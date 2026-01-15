import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import { StoreNotFoundError, AppError } from '../../common/errors/index.js';
import { config } from '../../config/index.js';

const logger = createModuleLogger('BillingService');

/**
 * Plan Features
 */
export interface PlanFeatures {
  maxProviders: number;
  customBranding: boolean;
  analytics: boolean;
  prioritySupport: boolean;
  samlSupport?: boolean;
  dedicatedSupport?: boolean;
  customIntegrations?: boolean;
}

/**
 * Plan Limits
 */
export interface PlanLimits {
  providers: number;
  uniqueLogins: number;
}

/**
 * Plan Usage
 */
export interface PlanUsage {
  providers: number;
  uniqueLogins: number;
}

/**
 * Current Plan Response
 */
export interface CurrentPlanResponse {
  plan: string;
  planName: string;
  features: string[];
  limits: PlanLimits;
  usage: PlanUsage;
}

/**
 * Billing Service
 * 
 * Manages billing and subscription information.
 */
export class BillingService {
  /**
   * Get current plan for a store
   */
  async getCurrentPlan(storeId: string): Promise<CurrentPlanResponse> {
    // Get subscription with plan and provider count
    const [subscription, providerCount, monthlyLogins] = await Promise.all([
      prisma.subscription.findUnique({
        where: { storeId },
        include: { plan: true },
      }),
      prisma.ssoProvider.count({
        where: { storeId },
      }),
      this.getMonthlyUniqueLogins(storeId),
    ]);

    if (!subscription) {
      // Return free plan defaults if no subscription
      return {
        plan: 'free',
        planName: 'Free',
        features: ['1 SSO Provider', '100 unique logins/month', 'Basic support'],
        limits: {
          providers: 1,
          uniqueLogins: 100,
        },
        usage: {
          providers: providerCount,
          uniqueLogins: monthlyLogins,
        },
      };
    }

    const planFeatures = subscription.plan.features as PlanFeatures | null;
    const features = this.buildFeatureList(subscription.plan.name, planFeatures);

    return {
      plan: subscription.plan.name.toLowerCase(),
      planName: subscription.plan.name,
      features,
      limits: {
        providers: planFeatures?.maxProviders || 1,
        uniqueLogins: subscription.plan.userLimit === -1 ? -1 : subscription.plan.userLimit,
      },
      usage: {
        providers: providerCount,
        uniqueLogins: monthlyLogins,
      },
    };
  }

  /**
   * Get monthly unique logins count
   */
  private async getMonthlyUniqueLogins(storeId: string): Promise<number> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return prisma.ssoUser.count({
      where: {
        storeId,
        lastLoginAt: { gte: monthStart },
      },
    });
  }

  /**
   * Build human-readable feature list from plan
   */
  private buildFeatureList(planName: string, features: PlanFeatures | null): string[] {
    const featureList: string[] = [];

    if (!features) {
      return ['Basic SSO functionality'];
    }

    // Provider limit
    if (features.maxProviders === -1) {
      featureList.push('Unlimited SSO Providers');
    } else {
      featureList.push(`${features.maxProviders} SSO Provider${features.maxProviders > 1 ? 's' : ''}`);
    }

    // User limit based on plan
    switch (planName.toLowerCase()) {
      case 'free':
        featureList.push('100 unique logins/month');
        break;
      case 'starter':
        featureList.push('500 unique logins/month');
        break;
      case 'pro':
        featureList.push('2,000 unique logins/month');
        break;
      case 'enterprise':
        featureList.push('Unlimited logins');
        break;
    }

    // Additional features
    if (features.customBranding) {
      featureList.push('Custom branding');
    }

    if (features.analytics) {
      featureList.push('Analytics dashboard');
    }

    if (features.samlSupport) {
      featureList.push('SAML 2.0 support');
    }

    if (features.prioritySupport) {
      featureList.push('Priority support');
    }

    if (features.dedicatedSupport) {
      featureList.push('Dedicated account manager');
    }

    if (features.customIntegrations) {
      featureList.push('Custom integrations');
    }

    return featureList;
  }

  /**
   * Upgrade plan - creates Shopify billing charge
   */
  async upgradePlan(storeId: string, planId: string): Promise<{ confirmationUrl: string }> {
    // Get the store and plan details
    const [store, plan] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId } }),
      prisma.plan.findUnique({ where: { id: planId } }),
    ]);

    if (!store) {
      throw new StoreNotFoundError(`Store ${storeId} not found`);
    }

    if (!plan) {
      throw new AppError('PLAN_NOT_FOUND', `Plan ${planId} not found`, 404);
    }

    // For now, return a mock confirmation URL
    // In production, this would create a Shopify billing charge
    // using the Shopify Admin API
    logger.info({ storeId, planId, planName: plan.name }, 'Creating billing charge for plan upgrade');

    // TODO: Implement Shopify billing API integration
    // const charge = await shopifyService.createRecurringCharge(store, plan);
    // return { confirmationUrl: charge.confirmation_url };

    // Mock response for development
    const confirmationUrl = `https://${store.domain}/admin/charges/confirm?plan=${plan.name}`;

    return { confirmationUrl };
  }
}

// Singleton instance
export const billingService = new BillingService();
