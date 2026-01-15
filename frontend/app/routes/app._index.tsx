import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
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
  InlineGrid,
  Divider,
  Banner,
  Icon,
  ProgressBar,
  EmptyState,
} from "@shopify/polaris";
import {
  PersonIcon,
  KeyIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ExternalIcon,
  ChartVerticalIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback } from "react";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const storeName = shopDomain.replace('.myshopify.com', '');

  const apiService = createApiService(shopDomain);

  try {
    const [stats, recentLogins, onboardingStatus, planInfo] = await Promise.all([
      apiService.getDashboardStats().catch(() => ({
        ssoProviders: 0,
        activeProviders: 0,
        uniqueLogins: 0,
        totalLogins: 0,
      })),
      apiService.getRecentLogins(5).catch(() => []),
      apiService.getOnboardingStatus().catch(() => ({
        hasProvider: false,
        hasUsers: false,
        hasEnabledAppEmbed: false,
        completedSteps: [],
      })),
      apiService.getCurrentPlan().catch(() => ({
        plan: 'free',
        features: [],
      })),
    ]);

    return json({
      shopDomain,
      storeName,
      stats,
      recentLogins,
      onboarding: {
        hasProvider: onboardingStatus.hasProvider,
        hasUsers: onboardingStatus.hasUsers,
        hasEnabledAppEmbed: onboardingStatus.hasEnabledAppEmbed,
        showTour: !onboardingStatus.hasProvider,
      },
      plan: planInfo.plan.toUpperCase(),
      ssoEnabled: stats.activeProviders > 0,
    });
  } catch (error) {
    console.error('Dashboard loader error:', error);
    return json({
      shopDomain,
      storeName,
      stats: {
        ssoProviders: 0,
        activeProviders: 0,
        uniqueLogins: 0,
        totalLogins: 0,
      },
      recentLogins: [],
      onboarding: {
        hasProvider: false,
        hasUsers: false,
        hasEnabledAppEmbed: false,
        showTour: true,
      },
      plan: 'FREE',
      ssoEnabled: false,
    });
  }
};

function StatCard({ title, value, subtitle, icon }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingSm" tone="subdued">{title}</Text>
          <Icon source={icon} tone="subdued" />
        </InlineStack>
        <Text as="p" variant="heading2xl">{value}</Text>
        {subtitle && (
          <Text as="p" variant="bodySm" tone="subdued">{subtitle}</Text>
        )}
      </BlockStack>
    </Card>
  );
}

export default function Dashboard() {
  const { shopDomain, storeName, stats, recentLogins, onboarding, plan, ssoEnabled } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const themeEditorUrl = `https://admin.shopify.com/store/${storeName}/themes/current/editor?context=apps`;

  const onboardingSteps = [
    {
      key: 'provider',
      label: 'Add an SSO provider',
      completed: stats.ssoProviders > 0,
      url: '/app/sso-providers/new',
      description: 'Connect Google, Microsoft, Okta, or custom SAML/OIDC'
    },
    {
      key: 'login',
      label: 'Enable SSO login button',
      completed: onboarding.hasEnabledAppEmbed,
      url: themeEditorUrl,
      external: true,
      description: 'Add SSO buttons to your store login page'
    },
  ];
  const completedSteps = onboardingSteps.filter(s => s.completed).length;
  const progressPercent = (completedSteps / onboardingSteps.length) * 100;
  const isSetupComplete = completedSteps === onboardingSteps.length;

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {/* Welcome Banner for new users */}
        {stats.ssoProviders === 0 && (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text as="h2" variant="headingLg">Welcome to Alintro IAM</Text>
                <Text as="p" tone="subdued">
                  Enable secure Single Sign-On authentication for your customers in two simple steps.
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                <Button variant="primary" url="/app/sso-providers/new">
                  Add SSO Provider
                </Button>
                <Button url="/app/settings">
                  Configure Settings
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* Setup Progress */}
        {!isSetupComplete && stats.ssoProviders > 0 && (
          <Banner
            title={`Setup: ${completedSteps} of ${onboardingSteps.length} steps completed`}
            tone="info"
          >
            <Box paddingBlockStart="200">
              <ProgressBar progress={progressPercent} size="small" />
            </Box>
          </Banner>
        )}

        <Layout>
          {/* Stats */}
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
              <StatCard
                title="SSO Providers"
                value={stats.ssoProviders}
                subtitle={`${stats.activeProviders} active`}
                icon={KeyIcon}
              />
              <StatCard
                title="SSO Logins"
                value={stats.uniqueLogins}
                subtitle="Unique users"
                icon={PersonIcon}
              />
              <StatCard
                title="Current Plan"
                value={plan}
                subtitle={plan === "FREE" ? "Upgrade for more features" : "Active subscription"}
                icon={ChartVerticalIcon}
              />
            </InlineGrid>
          </Layout.Section>

          {/* Recent Activity */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Recent Login Activity</Text>
                  <Button variant="plain" url="/app/audit-logs">View all</Button>
                </InlineStack>
                <Divider />
                {recentLogins.length === 0 ? (
                  <EmptyState
                    heading="No login activity yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Configure an SSO provider to start tracking logins.</p>
                  </EmptyState>
                ) : (
                  <BlockStack gap="300">
                    {recentLogins.map((login: any) => (
                      <Box
                        key={login.id}
                        padding="300"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="300" blockAlign="center">
                            <Icon
                              source={login.status === "success" ? CheckCircleIcon : AlertCircleIcon}
                              tone={login.status === "success" ? "success" : "critical"}
                            />
                            <BlockStack gap="050">
                              <Text as="span" variant="bodyMd" fontWeight="medium">
                                {login.email || "Unknown user"}
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {login.provider}
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone={login.status === "success" ? "success" : "critical"}>
                              {login.status}
                            </Badge>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {(() => {
                                const date = new Date(login.timestamp);
                                // Use fixed format to avoid hydration mismatch - consistent across server/client
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                const month = monthNames[date.getMonth()];
                                const day = date.getDate();
                                const year = date.getFullYear();
                                return `${month} ${day}, ${year}`;
                              })()}
                            </Text>
                          </InlineStack>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Sidebar */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Quick Actions */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Quick Actions</Text>
                  <BlockStack gap="200">
                    <Button url="/app/sso-providers/new" fullWidth>
                      Add SSO Provider
                    </Button>
                    <Button url="/app/users" fullWidth variant="secondary">
                      Manage Users
                    </Button>
                    <Button url="/app/insights" fullWidth variant="secondary">
                      View AI Insights
                    </Button>
                    <Button
                      url={themeEditorUrl}
                      fullWidth
                      variant="secondary"
                      icon={ExternalIcon}
                      target="_blank"
                    >
                      Theme Settings
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* SSO Status */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">SSO Status</Text>
                  <Divider />
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="span">Authentication</Text>
                    <Badge tone={ssoEnabled ? "success" : "attention"}>
                      {ssoEnabled ? "Active" : "Not configured"}
                    </Badge>
                  </InlineStack>
                  {!ssoEnabled && (
                    <Button size="slim" url="/app/sso-providers/new">
                      Configure SSO
                    </Button>
                  )}
                </BlockStack>
              </Card>

              {/* Setup Checklist */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Setup Checklist</Text>
                    {isSetupComplete && <Badge tone="success">Complete</Badge>}
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="200">
                    {onboardingSteps.map((step) => (
                      <Box
                        key={step.key}
                        padding="300"
                        background={step.completed ? "bg-surface-success" : "bg-surface-secondary"}
                        borderRadius="200"
                      >
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          <Icon
                            source={step.completed ? CheckCircleIcon : AlertCircleIcon}
                            tone={step.completed ? "success" : "subdued"}
                          />
                          <BlockStack gap="050">
                            <Text as="span" variant="bodySm" fontWeight="medium">
                              {step.label}
                            </Text>
                            {step.description && (
                              <Text as="span" variant="bodyXs" tone="subdued">
                                {step.description}
                              </Text>
                            )}
                          </BlockStack>
                          {!step.completed && (
                            <Box minWidth="fit-content">
                              <Button
                                url={step.url}
                                size="slim"
                                target={step.external ? "_blank" : undefined}
                              >
                                {step.external ? "Open" : "Start"}
                              </Button>
                            </Box>
                          )}
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Resources */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Resources</Text>
                  <Divider />
                  <BlockStack gap="100">
                    <Button variant="plain" url="/app/settings" icon={SettingsIcon}>
                      App Settings
                    </Button>
                    <Button variant="plain" url="/app/audit-logs">
                      Audit Logs
                    </Button>
                    <Button variant="plain" url="/app/pricing">
                      Pricing Plans
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
