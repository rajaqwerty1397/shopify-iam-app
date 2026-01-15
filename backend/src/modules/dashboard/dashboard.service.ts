import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import { LoginEventType } from '@prisma/client';

const logger = createModuleLogger('DashboardService');

/**
 * Dashboard Stats Response
 */
export interface DashboardStats {
  ssoProviders: number;
  activeProviders: number;
  uniqueLogins: number;
  totalLogins: number;
}

/**
 * Recent Login Item
 */
export interface RecentLogin {
  id: string;
  email: string | null;
  provider: string | null;
  status: 'success' | 'failed';
  timestamp: Date;
  ipAddress: string | null;
  errorMessage: string | null;
}

/**
 * Dashboard Service
 * 
 * Provides aggregated statistics and recent activity for the store dashboard.
 */
export class DashboardService {
  /**
   * Get dashboard statistics for a store
   */
  async getStats(storeId: string): Promise<DashboardStats> {
    // Get current month's start date
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Execute all queries in parallel
    const [
      totalProviders,
      activeProviders,
      uniqueLoginsThisMonth,
      totalLoginsThisMonth,
    ] = await Promise.all([
      // Total SSO providers for this store
      prisma.ssoProvider.count({
        where: { storeId },
      }),

      // Active (enabled) SSO providers
      prisma.ssoProvider.count({
        where: {
          storeId,
          isEnabled: true,
          status: 'active',
        },
      }),

      // Unique users who logged in this month
      prisma.ssoUser.count({
        where: {
          storeId,
          lastLoginAt: { gte: monthStart },
        },
      }),

      // Total successful logins this month
      prisma.loginEvent.count({
        where: {
          storeId,
          eventType: 'login_success',
          createdAt: { gte: monthStart },
        },
      }),
    ]);

    return {
      ssoProviders: totalProviders,
      activeProviders,
      uniqueLogins: uniqueLoginsThisMonth,
      totalLogins: totalLoginsThisMonth,
    };
  }

  /**
   * Get recent login activity for a store
   */
  async getRecentLogins(storeId: string, limit: number = 5): Promise<RecentLogin[]> {
    // Cap limit at 50
    const safeLimit = Math.min(limit, 50);

    const events = await prisma.loginEvent.findMany({
      where: {
        storeId,
        eventType: {
          in: ['login_success', 'login_failed'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      include: {
        ssoUser: {
          select: { email: true },
        },
        ssoProvider: {
          select: { displayName: true },
        },
      },
    });

    return events.map((event) => ({
      id: event.id.toString(),
      email: event.ssoUser?.email || null,
      provider: event.ssoProvider?.displayName || null,
      status: event.eventType === 'login_success' ? 'success' : 'failed',
      timestamp: event.createdAt,
      ipAddress: event.ipAddress,
      errorMessage: event.eventType === 'login_failed' ? event.errorCode : null,
    }));
  }
}

// Singleton instance
export const dashboardService = new DashboardService();
