import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { AppProvider as PolarisAppProvider, Page, Card, Text, BlockStack } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";

import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
};

export const headers: HeadersFunction = () => {
  return {
    "Content-Security-Policy": `frame-ancestors https://*.myshopify.com https://admin.shopify.com;`,
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">Dashboard</a>
        <a href="/app/sso-providers">SSO Providers</a>
        <a href="/app/users">Users</a>
        <a href="/app/insights">AI Insights</a>
        <a href="/app/pricing">Pricing</a>
        <a href="/app/settings">Settings</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Error boundary with Polaris styling
export function ErrorBoundary() {
  const error = useRouteError();
  console.error("App Error:", error);

  let errorMessage = "An unexpected error occurred";
  let errorDetails = "";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}`;
    errorDetails = error.data?.message || error.data || "";
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = error.stack || "";
  }

  return (
    <PolarisAppProvider i18n={{}}>
      <Page title="Application Error">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg" tone="critical">
              Something went wrong
            </Text>
            <Text as="p" variant="bodyMd">
              {errorMessage}
            </Text>
            {errorDetails && (
              <div
                style={{
                  background: "#fafafa",
                  padding: "12px",
                  borderRadius: "8px",
                  overflow: "auto",
                  maxHeight: "200px",
                }}
              >
                <pre style={{ margin: 0, fontSize: "12px", whiteSpace: "pre-wrap" }}>
                  {errorDetails}
                </pre>
              </div>
            )}
            <Text as="p" variant="bodySm" tone="subdued">
              Try refreshing the page or contact support if the problem persists.
            </Text>
          </BlockStack>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
