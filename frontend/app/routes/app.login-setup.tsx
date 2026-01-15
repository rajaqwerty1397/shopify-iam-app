import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Banner,
  Button,
  InlineStack,
  Box,
  Divider,
  Badge,
  List,
} from "@shopify/polaris";
import { useCallback } from "react";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const storeName = session.shop.replace('.myshopify.com', '');
  const apiService = createApiService(session.shop);

  let providerCount = 0;
  try {
    const providers = await apiService.getProviders();
    providerCount = providers?.length || 0;
  } catch {
    // Ignore errors
  }

  return json({
    shopDomain: session.shop,
    storeName,
    hasProviders: providerCount > 0,
  });
};

export default function LoginSetup() {
  const { storeName, hasProviders } = useLoaderData<typeof loader>();

  // Shopify admin URLs
  const appEmbedsUrl = `https://admin.shopify.com/store/${storeName}/themes/current/editor?context=apps`;
  const customerAccountsUrl = `https://admin.shopify.com/store/${storeName}/settings/customer_accounts`;
  const loginPageUrl = `https://${storeName}.myshopify.com/account/login`;

  // Handle external link clicks - opens in parent window (outside iframe)
  const handleExternalLink = useCallback((url: string) => {
    window.open(url, '_top');
  }, []);

  return (
    <Page
      title="Enable SSO Login Button"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        {!hasProviders && (
          <Layout.Section>
            <Banner tone="warning">
              <Text as="p">
                You need to add an SSO provider first before enabling the login button.
              </Text>
              <Box paddingBlockStart="200">
                <Button url="/app/sso-providers/new">Add SSO Provider</Button>
              </Box>
            </Banner>
          </Layout.Section>
        )}

        {/* Main Step: Enable App Embed */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" blockAlign="center">
                <Badge tone="success">Quick Setup</Badge>
                <Text as="h2" variant="headingLg">
                  Enable SSO Login Button
                </Text>
              </InlineStack>

              <Text as="p">
                Add the SSO login button to your store's customer login page with one click.
              </Text>

              <Divider />

              <Text as="h3" variant="headingMd">Steps:</Text>

              <List type="number">
                <List.Item>
                  Click "Open Theme Editor" below - this opens your Shopify theme settings
                </List.Item>
                <List.Item>
                  In the left sidebar under "App embeds", find <strong>"Alintro SSO Login"</strong>
                </List.Item>
                <List.Item>
                  Toggle it <strong>ON</strong>
                </List.Item>
                <List.Item>
                  Click <strong>Save</strong> in the top right
                </List.Item>
              </List>

              <Box paddingBlockStart="200">
                <Button
                  variant="primary"
                  size="large"
                  onClick={() => handleExternalLink(appEmbedsUrl)}
                >
                  Open Theme Editor
                </Button>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Test the Setup */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Test Your Setup
              </Text>

              <Text as="p" tone="subdued">
                After enabling the app embed, visit your store's login page to verify the SSO button appears.
              </Text>

              <Button onClick={() => handleExternalLink(loginPageUrl)}>
                View Login Page
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* How it Works */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                How SSO Login Works
              </Text>

              <Divider />

              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="start">
                  <Box>
                    <Badge tone="info">1</Badge>
                  </Box>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">Customer clicks SSO button</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      The SSO login button appears on your store's login page alongside the regular login form.
                    </Text>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="200" blockAlign="start">
                  <Box>
                    <Badge tone="info">2</Badge>
                  </Box>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">Redirected to Identity Provider</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Customer is redirected to your configured SSO provider (Google, Microsoft, etc.) to authenticate.
                    </Text>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="200" blockAlign="start">
                  <Box>
                    <Badge tone="info">3</Badge>
                  </Box>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">Auto-created & logged in</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      After successful authentication, the customer account is automatically created (if new) and logged into your store.
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Additional Settings */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Additional Settings
              </Text>

              <Divider />

              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">Customer Account Settings</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Configure how customer accounts work on your store.
                  </Text>
                </BlockStack>
                <Button
                  size="slim"
                  onClick={() => handleExternalLink(customerAccountsUrl)}
                >
                  Open Settings
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Troubleshooting */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Troubleshooting
              </Text>

              <Divider />

              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">Button not appearing?</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Make sure you've enabled "Alintro SSO Login" in the App embeds section and clicked Save.
                  </Text>
                </BlockStack>

                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">Login not working?</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Check that your SSO provider is configured correctly and set to "Active" status.
                  </Text>
                </BlockStack>

                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">Need help?</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Contact support at support@alintro.com or check the SSO provider configuration guides.
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
