import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Box,
  InlineStack,
  Badge,
  Button,
  Banner,
  InlineGrid,
  Divider,
  Spinner,
  Icon,
  SkeletonBodyText,
  SkeletonDisplayText,
  EmptyState,
} from "@shopify/polaris";
import {
  RefreshIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ChartVerticalFilledIcon,
  LightbulbIcon,
  LockIcon,
  ClockIcon,
} from "@shopify/polaris-icons";
import { useCallback } from "react";

import { authenticate } from "../shopify.server";
import { createApiService, type AIInsight, type AnalyticsData } from "../lib/api.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const apiService = createApiService(shopDomain);

  try {
    const insights = await apiService.getInsights();
    return json({ insights, error: null });
  } catch (error: any) {
    return json({
      insights: null,
      error: error.message || "Failed to load insights",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const apiService = createApiService(shopDomain);

  try {
    const insights = await apiService.refreshInsights();
    return json({ insights, error: null, refreshed: true });
  } catch (error: any) {
    return json({
      insights: null,
      error: error.message || "Failed to refresh insights",
      refreshed: false,
    });
  }
};

function MetricCard({ title, value, subtitle, tone }: {
  title: string;
  value: string | number;
  subtitle?: string;
  tone?: "success" | "warning" | "critical";
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm" tone="subdued">{title}</Text>
        <Text as="p" variant="heading2xl">{value}</Text>
        {subtitle && (
          <Text as="p" variant="bodySm" tone={tone || "subdued"}>{subtitle}</Text>
        )}
      </BlockStack>
    </Card>
  );
}

function InsightCard({ insight }: { insight: AIInsight }) {
  const getPriorityTone = (priority: string) => {
    const tones: Record<string, "success" | "warning" | "critical" | "info"> = {
      low: "success",
      medium: "info",
      high: "warning",
      critical: "critical",
    };
    return tones[priority] || "info";
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, any> = {
      security: LockIcon,
      optimization: ChartVerticalFilledIcon,
      trend: ChartVerticalFilledIcon,
      alert: AlertTriangleIcon,
      recommendation: LightbulbIcon,
    };
    return icons[type] || LightbulbIcon;
  };

  const getBackgroundColor = (priority: string) => {
    if (priority === "critical") return "bg-surface-critical";
    if (priority === "high") return "bg-surface-warning";
    return "bg-surface-secondary";
  };

  return (
    <Box
      padding="400"
      background={getBackgroundColor(insight.priority)}
      borderRadius="200"
    >
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start" wrap={false}>
          <InlineStack gap="300" blockAlign="center">
            <Box>
              <Icon source={getTypeIcon(insight.type)} tone="base" />
            </Box>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" fontWeight="semibold">
                {insight.title}
              </Text>
              <InlineStack gap="200">
                <Badge tone={getPriorityTone(insight.priority)}>
                  {insight.priority}
                </Badge>
                <Badge>{insight.type}</Badge>
              </InlineStack>
            </BlockStack>
          </InlineStack>
          {insight.metric && (
            <Badge tone="info">{insight.metric}</Badge>
          )}
        </InlineStack>

        <Text as="p" variant="bodyMd">{insight.description}</Text>

        {insight.action && (
          <Box padding="300" background="bg-surface" borderRadius="100">
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodySm" fontWeight="semibold">
                Recommended:
              </Text>
              <Text as="span" variant="bodySm">{insight.action}</Text>
            </InlineStack>
          </Box>
        )}
      </BlockStack>
    </Box>
  );
}

function LoadingSkeleton() {
  return (
    <Page title="AI Insights" backAction={{ content: "Dashboard", url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={2} />
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <BlockStack gap="200">
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={1} />
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default function Insights() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isRefreshing = navigation.state === "submitting";

  const data = actionData?.insights || loaderData.insights;
  const error = actionData?.error || loaderData.error;

  const handleRefresh = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "refresh");
    submit(formData, { method: "post" });
  }, [submit]);

  if (error && !data) {
    return (
      <Page
        title="AI Insights"
        backAction={{ content: "Dashboard", url: "/app" }}
        primaryAction={{
          content: "Retry",
          icon: RefreshIcon,
          onAction: handleRefresh,
          loading: isRefreshing,
        }}
      >
        <Layout>
          <Layout.Section>
            <Banner tone="critical" title="Unable to load insights">
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (!data) {
    return <LoadingSkeleton />;
  }

  const { summary, insights, analytics, generatedAt } = data;
  const loginSuccessRate = analytics.totalLogins > 0
    ? ((analytics.successfulLogins / analytics.totalLogins) * 100)
    : 100;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    // Use fixed format to avoid hydration mismatch between server and client
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month} ${day}, ${hours}:${minutes}`;
  };

  return (
    <Page
      title="AI Insights"
      subtitle="Powered by Groq AI"
      backAction={{ content: "Dashboard", url: "/app" }}
      primaryAction={{
        content: "Refresh",
        icon: RefreshIcon,
        onAction: handleRefresh,
        loading: isRefreshing,
      }}
    >
      <Layout>
        {actionData?.refreshed && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>
              Insights refreshed successfully
            </Banner>
          </Layout.Section>
        )}

        {/* Summary */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Summary</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={ClockIcon} tone="subdued" />
                  <Text as="span" variant="bodySm" tone="subdued">
                    {formatDate(generatedAt)}
                  </Text>
                </InlineStack>
              </InlineStack>
              <Text as="p">{summary}</Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Key Metrics */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <MetricCard
              title="Total Users"
              value={analytics.totalUsers}
              subtitle={`${analytics.activeUsers} active`}
              tone="success"
            />
            <MetricCard
              title="SSO Providers"
              value={analytics.totalProviders}
              subtitle={`${analytics.activeProviders} active`}
              tone="success"
            />
            <MetricCard
              title="Success Rate"
              value={`${loginSuccessRate.toFixed(1)}%`}
              subtitle="Login success rate"
              tone={loginSuccessRate >= 80 ? "success" : loginSuccessRate >= 60 ? "warning" : "critical"}
            />
            <MetricCard
              title="Total Logins"
              value={analytics.totalLogins}
              subtitle="Last 30 days"
            />
          </InlineGrid>
        </Layout.Section>

        {/* AI Insights */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Insights</Text>
                <Badge tone="info">{insights.length} insights</Badge>
              </InlineStack>

              {insights.length === 0 ? (
                <EmptyState
                  heading="No insights available"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Add more data to generate AI-powered insights about your SSO usage.</p>
                </EmptyState>
              ) : (
                <BlockStack gap="300">
                  {insights.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} />
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Detailed Analytics */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            {/* Logins by Provider */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Logins by Provider</Text>
                <Divider />
                {analytics.loginsByProvider.length === 0 ? (
                  <Text as="p" tone="subdued">No login data available</Text>
                ) : (
                  <BlockStack gap="300">
                    {analytics.loginsByProvider.map((item, index) => (
                      <InlineStack key={index} align="space-between">
                        <Text as="span">{item.provider}</Text>
                        <Badge>{item.count}</Badge>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Login Trend */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Login Trend (7 Days)</Text>
                <Divider />
                {analytics.loginsByDay.length === 0 ? (
                  <Text as="p" tone="subdued">No login data available</Text>
                ) : (
                  <BlockStack gap="200">
                    {analytics.loginsByDay.map((day, index) => (
                      <InlineStack key={index} align="space-between">
                        <Text as="span" variant="bodySm">
                          {(() => {
                            const date = new Date(day.date);
                            const weekday = date.toLocaleString('en-US', { weekday: 'short' });
                            const month = date.toLocaleString('en-US', { month: 'short' });
                            const dayNum = date.getDate();
                            return `${weekday}, ${month} ${dayNum}`;
                          })()}
                        </Text>
                        <InlineStack gap="200">
                          <Badge tone="success">{day.success}</Badge>
                          {day.failed > 0 && <Badge tone="critical">{day.failed}</Badge>}
                        </InlineStack>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Top Users & Errors */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            {/* Top Users */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Top Users</Text>
                <Divider />
                {analytics.topUsers.length === 0 ? (
                  <Text as="p" tone="subdued">No user data available</Text>
                ) : (
                  <BlockStack gap="300">
                    {analytics.topUsers.slice(0, 5).map((user, index) => (
                      <InlineStack key={index} align="space-between">
                        <Text as="span" variant="bodySm">{user.email}</Text>
                        <Badge>{user.loginCount} logins</Badge>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Recent Errors */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Recent Errors</Text>
                <Divider />
                {analytics.recentErrors.length === 0 ? (
                  <Banner tone="success" icon={CheckCircleIcon}>
                    No recent errors
                  </Banner>
                ) : (
                  <BlockStack gap="300">
                    {analytics.recentErrors.map((error, index) => (
                      <InlineStack key={index} align="space-between">
                        <Text as="span" tone="critical">{error.error}</Text>
                        <Badge tone="critical">{error.count}</Badge>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
