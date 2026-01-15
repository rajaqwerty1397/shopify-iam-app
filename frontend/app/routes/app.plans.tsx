import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Divider,
  Icon,
  Box,
  Banner,
} from "@shopify/polaris";
import { CheckCircleIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    yearlyPrice: 529,
    features: [
      "500 Unique Users/month",
      "Single IDP support",
      "Basic Attribute Mapping",
      "Auto Account Activation",
      "SSO for Customer Accounts",
      "Email Support",
    ],
    recommended: false,
  },
  {
    id: "growth",
    name: "Growth",
    price: 79,
    yearlyPrice: 853,
    features: [
      "1500 Unique Users/month",
      "All Starter Features",
      "Multiple IDPs support",
      "Advanced Attribute Mapping",
      "Auto-Redirect to IDP",
      "SCIM Provisioning",
      "Priority Support",
    ],
    recommended: true,
  },
  {
    id: "business",
    name: "Business",
    price: 79,
    yearlyPrice: 853,
    features: [
      "1500 Unique Users/month",
      "Complete Store Protection",
      "Multipass Login Support",
      "Mobile Application Support",
      "Custom Checkout Experience",
      "SSO for B2B Accounts",
    ],
    recommended: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 129,
    yearlyPrice: 1393,
    features: [
      "3000+ Unique Users/month",
      "All Business Features",
      "Mobile Login (JWT)",
      "Multipass Login Support",
      "Auto-Redirect to IDP",
      "Dedicated Support",
      "Custom Integrations",
    ],
    recommended: false,
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Get current plan from backend
  const apiService = createApiService(shopDomain);

  try {
    const planInfo = await apiService.getCurrentPlan();
    return json({
      currentPlan: planInfo.plan.toUpperCase(),
      shopDomain,
    });
  } catch (error) {
    console.error('Plans loader error:', error);
    return json({
      currentPlan: 'FREE',
      shopDomain,
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const planId = formData.get("planId") as string;
  const billingCycle = formData.get("billingCycle") as string;

  const plan = PLANS.find((p) => p.id === planId);

  if (!plan) {
    return json({ error: "Invalid plan" }, { status: 400 });
  }

  // Create Shopify billing subscription
  const isYearly = billingCycle === "yearly";
  const price = isYearly ? plan.yearlyPrice : plan.price;

  const response = await admin.graphql(
    `#graphql
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        test: $test
        lineItems: $lineItems
      ) {
        appSubscription {
          id
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        name: `IAM SSO - ${plan.name} ${isYearly ? "(Yearly)" : "(Monthly)"}`,
        returnUrl: `${process.env.SHOPIFY_APP_URL}/app/plans/callback?plan=${planId}`,
        test: process.env.NODE_ENV !== "production",
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: price,
                  currencyCode: "USD",
                },
                interval: isYearly ? "ANNUAL" : "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
    }
  );

  const data = await response.json();

  if (data.data?.appSubscriptionCreate?.userErrors?.length > 0) {
    return json(
      { error: data.data.appSubscriptionCreate.userErrors[0].message },
      { status: 400 }
    );
  }

  const confirmationUrl = data.data?.appSubscriptionCreate?.confirmationUrl;

  if (confirmationUrl) {
    return redirect(confirmationUrl);
  }

  return json({ error: "Failed to create subscription" }, { status: 500 });
};

export default function Plans() {
  const { currentPlan } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const handleSelectPlan = (planId: string, billingCycle: string) => {
    const formData = new FormData();
    formData.append("planId", planId);
    formData.append("billingCycle", billingCycle);
    submit(formData, { method: "post" });
  };

  return (
    <Page title="Choose Your Plan" backAction={{ content: "Settings", url: "/app/settings" }}>
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            <p>All plans include a 15-day free trial. Cancel anytime.</p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <InlineStack gap="400" align="center" blockAlign="stretch">
            {PLANS.map((plan) => (
              <Card key={plan.id}>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="h2" variant="headingLg">
                        {plan.name}
                      </Text>
                      {plan.recommended && (
                        <Badge tone="success">Recommended</Badge>
                      )}
                    </InlineStack>
                    
                    <BlockStack gap="100">
                      <InlineStack gap="100" blockAlign="baseline">
                        <Text as="span" variant="heading2xl" fontWeight="bold">
                          ${plan.price}
                        </Text>
                        <Text as="span" tone="subdued">/month</Text>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        or ${plan.yearlyPrice}/year (save 10%)
                      </Text>
                    </BlockStack>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    {plan.features.map((feature, idx) => (
                      <InlineStack key={idx} gap="200" blockAlign="start">
                        <Box>
                          <Icon source={CheckCircleIcon} tone="success" />
                        </Box>
                        <Text as="span" variant="bodyMd">
                          {feature}
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="200">
                    <Button
                      variant={plan.recommended ? "primary" : "secondary"}
                      fullWidth
                      onClick={() => handleSelectPlan(plan.id, "monthly")}
                      loading={isSubmitting}
                      disabled={currentPlan === plan.id.toUpperCase()}
                    >
                      {currentPlan === plan.id.toUpperCase()
                        ? "Current Plan"
                        : "Start Monthly"}
                    </Button>
                    <Button
                      fullWidth
                      onClick={() => handleSelectPlan(plan.id, "yearly")}
                      loading={isSubmitting}
                      disabled={currentPlan === plan.id.toUpperCase()}
                    >
                      Start Yearly (Save 10%)
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>
            ))}
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Frequently Asked Questions
              </Text>
              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">What happens after the trial?</Text>
                  <Text as="p" tone="subdued">
                    After your 15-day free trial, you'll be charged based on your selected plan. 
                    You can cancel anytime before the trial ends.
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">Can I change plans?</Text>
                  <Text as="p" tone="subdued">
                    Yes, you can upgrade or downgrade your plan at any time. 
                    Changes take effect on your next billing cycle.
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">What counts as a unique user?</Text>
                  <Text as="p" tone="subdued">
                    A unique user is counted once per month, regardless of how many times they log in.
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
