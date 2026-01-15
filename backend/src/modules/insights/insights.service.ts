import { prisma } from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';

const logger = createModuleLogger('InsightsService');

// Groq API configuration
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant'; // Cheapest model as requested

/**
 * Analytics Data for AI Analysis
 */
export interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  suspendedUsers: number;
  totalProviders: number;
  activeProviders: number;
  totalLogins: number;
  successfulLogins: number;
  failedLogins: number;
  loginsByProvider: { provider: string; count: number }[];
  loginsByDay: { date: string; success: number; failed: number }[];
  topUsers: { email: string; loginCount: number }[];
  organizations: number;
  domains: number;
  verifiedDomains: number;
  recentErrors: { error: string; count: number }[];
}

/**
 * AI Insight Response
 */
export interface AIInsight {
  id: string;
  type: 'security' | 'optimization' | 'trend' | 'alert' | 'recommendation';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  metric?: string;
  action?: string;
  createdAt: Date;
}

/**
 * Insights Response
 */
export interface InsightsResponse {
  summary: string;
  insights: AIInsight[];
  analytics: AnalyticsData;
  generatedAt: Date;
}

/**
 * Insights Service
 *
 * Uses Groq AI to analyze SSO data and provide actionable insights.
 */
export class InsightsService {
  private groqApiKey: string;

  constructor() {
    this.groqApiKey = process.env.GROQ_API_KEY || '';
  }

  /**
   * Collect analytics data for a store
   */
  async collectAnalyticsData(storeId: string): Promise<AnalyticsData> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Execute all queries in parallel
    const [
      totalUsers,
      activeUsers,
      pendingUsers,
      suspendedUsers,
      totalProviders,
      activeProviders,
      totalLogins,
      successfulLogins,
      failedLogins,
      loginsByProvider,
      recentLoginEvents,
      topUsersByLogins,
      recentErrors,
    ] = await Promise.all([
      // User counts (SsoUserStatus enum: active, blocked, pending)
      prisma.ssoUser.count({ where: { storeId } }),
      prisma.ssoUser.count({ where: { storeId, status: 'active' } }),
      prisma.ssoUser.count({ where: { storeId, status: 'pending' } }),
      prisma.ssoUser.count({ where: { storeId, status: 'blocked' } }),

      // Provider counts
      prisma.ssoProvider.count({ where: { storeId } }),
      prisma.ssoProvider.count({ where: { storeId, isEnabled: true, status: 'active' } }),

      // Login counts (last 30 days)
      prisma.loginEvent.count({
        where: { storeId, createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.loginEvent.count({
        where: { storeId, eventType: 'login_success', createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.loginEvent.count({
        where: { storeId, eventType: 'login_failed', createdAt: { gte: thirtyDaysAgo } },
      }),

      // Logins by provider
      prisma.loginEvent.groupBy({
        by: ['ssoProviderId'],
        where: { storeId, createdAt: { gte: thirtyDaysAgo } },
        _count: { id: true },
      }),

      // Recent login events for daily breakdown
      prisma.loginEvent.findMany({
        where: { storeId, createdAt: { gte: sevenDaysAgo } },
        select: { eventType: true, createdAt: true },
      }),

      // Top users by login count
      prisma.ssoUser.findMany({
        where: { storeId },
        orderBy: { loginCount: 'desc' },
        take: 10,
        select: { email: true, loginCount: true },
      }),

      // Recent errors (last 7 days)
      prisma.loginEvent.groupBy({
        by: ['errorCode'],
        where: {
          storeId,
          eventType: 'login_failed',
          createdAt: { gte: sevenDaysAgo },
          errorCode: { not: null },
        },
        _count: { id: true },
      }),
    ]);

    // Set defaults for models that don't exist
    const organizations = 0;
    const domains = 0;
    const verifiedDomains = 0;

    // Get provider names for login breakdown
    const providerIds = loginsByProvider.map((l) => l.ssoProviderId).filter((id): id is bigint => id !== null);
    const providers = await prisma.ssoProvider.findMany({
      where: { id: { in: providerIds } },
      select: { id: true, displayName: true },
    });

    const providerMap = new Map(providers.map((p) => [p.id.toString(), p.displayName]));

    // Calculate daily login breakdown
    const loginsByDay = this.calculateDailyLogins(recentLoginEvents, sevenDaysAgo);

    return {
      totalUsers,
      activeUsers,
      pendingUsers,
      suspendedUsers,
      totalProviders,
      activeProviders,
      totalLogins,
      successfulLogins,
      failedLogins,
      loginsByProvider: loginsByProvider.map((l) => ({
        provider: l.ssoProviderId ? providerMap.get(l.ssoProviderId.toString()) || 'Unknown' : 'Unknown',
        count: l._count.id,
      })),
      loginsByDay,
      topUsers: topUsersByLogins.map((u) => ({
        email: u.email,
        loginCount: u.loginCount,
      })),
      organizations,
      domains,
      verifiedDomains,
      recentErrors: recentErrors.map((e) => ({
        error: e.errorCode || 'unknown',
        count: e._count.id,
      })),
    };
  }

  /**
   * Calculate daily login breakdown
   */
  private calculateDailyLogins(
    events: { eventType: string; createdAt: Date }[],
    startDate: Date
  ): { date: string; success: number; failed: number }[] {
    const dayMap = new Map<string, { success: number; failed: number }>();

    // Initialize 7 days
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      dayMap.set(dateStr, { success: 0, failed: 0 });
    }

    // Count events by day
    for (const event of events) {
      const dateStr = event.createdAt.toISOString().split('T')[0];
      const day = dayMap.get(dateStr);
      if (day) {
        if (event.eventType === 'login_success') {
          day.success++;
        } else if (event.eventType === 'login_failed') {
          day.failed++;
        }
      }
    }

    return Array.from(dayMap.entries()).map(([date, counts]) => ({
      date,
      ...counts,
    }));
  }

  /**
   * Generate AI insights using Groq
   */
  async generateInsights(storeId: string): Promise<InsightsResponse> {
    // Check cache first
    const cacheKey = `insights:${storeId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Invalid cache, continue to regenerate
      }
    }

    // Collect analytics data
    const analytics = await this.collectAnalyticsData(storeId);

    // If no Groq API key, return basic insights
    if (!this.groqApiKey) {
      logger.warn('GROQ_API_KEY not configured, returning basic insights');
      return this.generateBasicInsights(analytics);
    }

    try {
      // Generate AI insights
      const aiInsights = await this.callGroqAPI(analytics);

      const response: InsightsResponse = {
        summary: aiInsights.summary,
        insights: aiInsights.insights,
        analytics,
        generatedAt: new Date(),
      };

      // Cache for 15 minutes
      await redis.setEx(cacheKey, 900, JSON.stringify(response));

      return response;
    } catch (error) {
      logger.error({ error }, 'Failed to generate AI insights, falling back to basic');
      return this.generateBasicInsights(analytics);
    }
  }

  /**
   * Call Groq API for AI analysis
   */
  private async callGroqAPI(analytics: AnalyticsData): Promise<{ summary: string; insights: AIInsight[] }> {
    const prompt = this.buildPrompt(analytics);

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an SSO (Single Sign-On) analytics expert. Analyze the provided data and generate actionable insights for improving security, user experience, and SSO adoption.

Return a JSON response with the following structure:
{
  "summary": "A brief 2-3 sentence overview of the SSO health and key findings",
  "insights": [
    {
      "type": "security|optimization|trend|alert|recommendation",
      "title": "Short insight title",
      "description": "Detailed description of the insight",
      "priority": "low|medium|high|critical",
      "metric": "Optional metric value if relevant",
      "action": "Optional recommended action"
    }
  ]
}

Focus on:
1. Security concerns (failed logins, unusual patterns)
2. Adoption metrics and trends
3. Provider performance
4. User engagement optimization
5. Actionable recommendations

Generate 3-6 insights based on the data.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${error}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in Groq response');
    }

    const parsed = JSON.parse(content);

    // Add IDs and timestamps to insights
    const insights: AIInsight[] = (parsed.insights || []).map((insight: any, index: number) => ({
      id: `insight-${Date.now()}-${index}`,
      type: insight.type || 'recommendation',
      title: insight.title || 'Insight',
      description: insight.description || '',
      priority: insight.priority || 'medium',
      metric: insight.metric,
      action: insight.action,
      createdAt: new Date(),
    }));

    return {
      summary: parsed.summary || 'No summary available',
      insights,
    };
  }

  /**
   * Build prompt for AI analysis
   */
  private buildPrompt(analytics: AnalyticsData): string {
    const loginSuccessRate = analytics.totalLogins > 0
      ? ((analytics.successfulLogins / analytics.totalLogins) * 100).toFixed(1)
      : 0;

    return `Analyze the following SSO analytics data for the past 30 days:

**User Statistics:**
- Total Users: ${analytics.totalUsers}
- Active Users: ${analytics.activeUsers}
- Pending Users: ${analytics.pendingUsers}
- Suspended Users: ${analytics.suspendedUsers}

**Provider Statistics:**
- Total Providers: ${analytics.totalProviders}
- Active Providers: ${analytics.activeProviders}

**Login Statistics (Last 30 Days):**
- Total Login Attempts: ${analytics.totalLogins}
- Successful Logins: ${analytics.successfulLogins}
- Failed Logins: ${analytics.failedLogins}
- Success Rate: ${loginSuccessRate}%

**Login by Provider:**
${analytics.loginsByProvider.map((p) => `- ${p.provider}: ${p.count} logins`).join('\n')}

**Daily Login Trend (Last 7 Days):**
${analytics.loginsByDay.map((d) => `- ${d.date}: ${d.success} success, ${d.failed} failed`).join('\n')}

**Top Users by Login Count:**
${analytics.topUsers.slice(0, 5).map((u) => `- ${u.email}: ${u.loginCount} logins`).join('\n')}

**Organization & Domain:**
- Organizations: ${analytics.organizations}
- Total Domains: ${analytics.domains}
- Verified Domains: ${analytics.verifiedDomains}

**Recent Error Codes:**
${analytics.recentErrors.length > 0
      ? analytics.recentErrors.map((e) => `- ${e.error}: ${e.count} occurrences`).join('\n')
      : '- No recent errors'}

Please analyze this data and provide actionable insights.`;
  }

  /**
   * Generate basic insights without AI
   */
  private generateBasicInsights(analytics: AnalyticsData): InsightsResponse {
    const insights: AIInsight[] = [];
    const now = new Date();

    // Calculate login success rate
    const loginSuccessRate = analytics.totalLogins > 0
      ? (analytics.successfulLogins / analytics.totalLogins) * 100
      : 100;

    // Check for security concerns
    if (loginSuccessRate < 80) {
      insights.push({
        id: `insight-${now.getTime()}-1`,
        type: 'security',
        title: 'High Login Failure Rate',
        description: `Login success rate is ${loginSuccessRate.toFixed(1)}%, which is below the recommended 80% threshold. This could indicate configuration issues or potential security attacks.`,
        priority: loginSuccessRate < 60 ? 'critical' : 'high',
        metric: `${loginSuccessRate.toFixed(1)}% success rate`,
        action: 'Review failed login attempts and check provider configurations',
        createdAt: now,
      });
    }

    // Check for inactive providers
    if (analytics.totalProviders > 0 && analytics.activeProviders === 0) {
      insights.push({
        id: `insight-${now.getTime()}-2`,
        type: 'alert',
        title: 'No Active SSO Providers',
        description: 'All SSO providers are currently inactive. Users will not be able to sign in using SSO.',
        priority: 'critical',
        action: 'Activate at least one SSO provider',
        createdAt: now,
      });
    }

    // Check for pending users
    if (analytics.pendingUsers > 5) {
      insights.push({
        id: `insight-${now.getTime()}-3`,
        type: 'recommendation',
        title: 'Pending User Invitations',
        description: `You have ${analytics.pendingUsers} pending user invitations. Consider sending reminder emails or reviewing the invitation process.`,
        priority: 'medium',
        metric: `${analytics.pendingUsers} pending users`,
        action: 'Send reminder emails to pending users',
        createdAt: now,
      });
    }

    // Domain verification
    if (analytics.domains > analytics.verifiedDomains) {
      insights.push({
        id: `insight-${now.getTime()}-4`,
        type: 'recommendation',
        title: 'Unverified Domains',
        description: `${analytics.domains - analytics.verifiedDomains} domain(s) are awaiting verification. Verified domains improve security and enable automatic user provisioning.`,
        priority: 'medium',
        metric: `${analytics.verifiedDomains}/${analytics.domains} verified`,
        action: 'Complete domain verification process',
        createdAt: now,
      });
    }

    // User adoption
    if (analytics.totalUsers > 0 && analytics.activeUsers / analytics.totalUsers < 0.5) {
      insights.push({
        id: `insight-${now.getTime()}-5`,
        type: 'optimization',
        title: 'Low User Adoption',
        description: `Only ${((analytics.activeUsers / analytics.totalUsers) * 100).toFixed(1)}% of users are active. Consider promoting SSO benefits to increase adoption.`,
        priority: 'medium',
        metric: `${analytics.activeUsers} active / ${analytics.totalUsers} total`,
        action: 'Send user engagement campaign',
        createdAt: now,
      });
    }

    // Positive insight if everything is good
    if (insights.length === 0) {
      insights.push({
        id: `insight-${now.getTime()}-0`,
        type: 'trend',
        title: 'SSO Health is Good',
        description: 'Your SSO setup is performing well. Keep monitoring for any changes in login patterns.',
        priority: 'low',
        metric: `${loginSuccessRate.toFixed(1)}% success rate`,
        createdAt: now,
      });
    }

    // Build summary
    const summary = `Your SSO system has ${analytics.totalUsers} users with ${analytics.activeProviders} active providers. ` +
      `In the last 30 days, there were ${analytics.totalLogins} login attempts with a ${loginSuccessRate.toFixed(1)}% success rate.`;

    return {
      summary,
      insights,
      analytics,
      generatedAt: now,
    };
  }

  /**
   * Clear insights cache for a store
   */
  async clearCache(storeId: string): Promise<void> {
    await redis.del(`insights:${storeId}`);
  }
}

// Singleton instance
export const insightsService = new InsightsService();
