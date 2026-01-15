import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  InlineGrid,
  Divider,
  Icon,
  Box,
  Banner,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { useState, useCallback } from "react";

import { authenticate } from "../shopify.server";

// Pricing plans configuration
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceDisplay: 'Free',
    description: 'For testing and small stores',
    features: [
      '1 SSO Provider',
      '100 unique logins/month',
      'Basic support',
      'SAML & OAuth support',
    ],
    limitations: [
      'No priority support',
      'Limited to 1 provider',
    ],
    popular: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    priceDisplay: '$29/month',
    description: 'For growing businesses',
    features: [
      '3 SSO Providers',
      '1,000 unique logins/month',
      'Email support',
      'SAML & OAuth support',
      'Custom branding',
    ],
    limitations: [],
    popular: false,
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 79,
    priceDisplay: '$79/month',
    description: 'For established businesses',
    features: [
      '10 SSO Providers',
      '10,000 unique logins/month',
      'Priority email support',
      'SAML & OAuth support',
      'Custom branding',
      'Advanced analytics',
      'Audit logs',
    ],
    limitations: [],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    priceDisplay: '$199/month',
    description: 'For large organizations',
    features: [
      'Unlimited SSO Providers',
      'Unlimited unique logins',
      'Dedicated support',
      'SAML & OAuth support',
      'Custom branding',
      'Advanced analytics',
      'Audit logs',
      'SLA guarantee',
      'Custom integrations',
    ],
    limitations: [],
    popular: false,
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  // Get current subscription status from Shopify
  let currentPlan = 'free';
  let isManagedPricing = false;
  
  try {
    // Check each plan to see if it's active
    const subscriptions = await billing.check({
      plans: ['Starter', 'Professional', 'Enterprise'],
      isTest: false,
    });
    
    // Find the active plan
    if (subscriptions.hasActivePayment) {
      // The appSubscriptions array contains active subscriptions
      if (subscriptions.appSubscriptions && subscriptions.appSubscriptions.length > 0) {
        const activeSub = subscriptions.appSubscriptions[0];
        currentPlan = activeSub.name.toLowerCase();
      }
    }
  } catch (error: any) {
    // Check if it's a managed pricing error
    if (error?.message?.includes('Managed Pricing') ||
        error?.graphQLErrors?.some((e: any) => e.message?.includes('Managed Pricing'))) {
      isManagedPricing = true;
    }
    // Default to free plan if we can't check
  }

  return json({
    shopDomain: session.shop,
    currentPlan,
    plans: PLANS,
    isManagedPricing,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const planId = formData.get("planId") as string;
  const actionType = formData.get("action") as string;

  // Find the plan
  const plan = PLANS.find(p => p.id === planId);
  if (!plan) {
    return json({ error: "Invalid plan" }, { status: 400 });
  }

  // Handle downgrade to free plan only
  if (plan.price === 0) {
    return json({
      success: true,
      message: "Successfully switched to free plan. Your current billing cycle will complete, then you'll be on the free plan."
    });
  }

  // Map plan ID to billing plan name (must match shopify.server.ts billing config)
  const billingPlanName = plan.name;

  try {
    return await billing.request({
      plan: billingPlanName,
      isTest: false,
      returnUrl: `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/pricing`,
    });
  } catch (error: any) {
    // Re-throw redirect responses
    if (error?.status >= 300 && error?.status < 400) {
      throw error;
    }

    return json({
      error: "Failed to process subscription. Please try again or contact support."
    }, { status: 500 });
  }
};

export default function Pricing() {
  const { currentPlan, plans } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  // Get the effective current plan (from action if simulated, otherwise from loader)
  const effectiveCurrentPlan = (actionData as any)?.plan || currentPlan;

  const handleSelectPlan = useCallback((planId: string) => {
    setSelectedPlan(planId);
    const formData = new FormData();
    formData.append("planId", planId);
    
    // Determine if this is an upgrade or downgrade
    const currentPlanPrice = plans.find(p => p.id === effectiveCurrentPlan)?.price || 0;
    const newPlanPrice = plans.find(p => p.id === planId)?.price || 0;
    formData.append("action", newPlanPrice < currentPlanPrice ? "downgrade" : "upgrade");
    
    submit(formData, { method: "post" });
  }, [submit, effectiveCurrentPlan, plans]);

  return (
    <Page title="Pricing Plans">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              Choose the plan that best fits your needs. All plans include core SSO functionality.
            </Text>

            {effectiveCurrentPlan && (
              <Banner tone="info">
                <Text as="p">
                  You are currently on the <strong>{effectiveCurrentPlan.toUpperCase()}</strong> plan.
                </Text>
              </Banner>
            )}

            {(actionData as any)?.success && (actionData as any)?.message && (
              <Banner tone="success">
                <Text as="p">{(actionData as any).message}</Text>
              </Banner>
            )}

            {(actionData as any)?.error && (
              <Banner tone="critical">
                <Text as="p">{(actionData as any).error}</Text>
              </Banner>
            )}
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
            {plans.map((plan) => (
              <Card key={plan.id}>
                <BlockStack gap="400">
                  {/* Plan Header */}
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        {plan.name}
                      </Text>
                      {plan.popular && (
                        <Badge tone="success">Popular</Badge>
                      )}
                    </InlineStack>
                    <Text as="p" variant="headingXl">
                      {plan.priceDisplay}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {plan.description}
                    </Text>
                  </BlockStack>

                  <Divider />

                  {/* Features */}
                  <BlockStack gap="200">
                    {plan.features.map((feature, index) => (
                      <InlineStack key={index} gap="200" blockAlign="start">
                        <Box>
                          <Icon source={CheckIcon} tone="success" />
                        </Box>
                        <Text as="span" variant="bodySm">
                          {feature}
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>

                  {/* Action Button */}
                  <Box paddingBlockStart="200">
                    {effectiveCurrentPlan === plan.id ? (
                      <Button fullWidth disabled>
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        fullWidth
                        variant={plan.popular ? "primary" : "secondary"}
                        onClick={() => handleSelectPlan(plan.id)}
                        loading={isSubmitting && selectedPlan === plan.id}
                      >
                        {(() => {
                          const currentPlanPrice = PLANS.find(p => p.id === effectiveCurrentPlan)?.price || 0;
                          if (plan.price === 0) return "Downgrade";
                          if (plan.price < currentPlanPrice) return "Downgrade";
                          return "Upgrade";
                        })()}
                      </Button>
                    )}
                  </Box>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        {/* FAQ Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Frequently Asked Questions
              </Text>
              <Divider />

              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    What counts as a unique login?
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    A unique login is counted once per user per month, regardless of how many times they log in.
                  </Text>
                </BlockStack>

                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Can I change plans anytime?
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.
                  </Text>
                </BlockStack>

                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Do you offer refunds?
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    We offer a 14-day money-back guarantee on all paid plans.
                  </Text>
                </BlockStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
