import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
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
  TextField,
  FormLayout,
  Banner,
  Divider,
  Tabs,
  Checkbox,
  Modal,
  DescriptionList,
  Collapsible,
  Spinner,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const apiService = createApiService(shopDomain);

  // Use OAUTH_CALLBACK_URL (Cloudflare tunnel) for OAuth callbacks
  // Falls back to SHOPIFY_APP_URL if not set
  // This is the URL that OAuth providers will redirect to after authentication
  const oauthCallbackUrl = process.env.OAUTH_CALLBACK_URL || process.env.SHOPIFY_APP_URL || process.env.APP_URL || 'https://localhost:3000';
  const backendUrl = oauthCallbackUrl;

  try {
    const data = await apiService.getProviderWithDetails(params.id!);
    return json({
      provider: data.provider,
      recentLogins: data.recentLogins,
      appUrl: backendUrl,
      shopDomain,
    });
  } catch (error) {
    throw new Response("Provider not found", { status: 404 });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const action = formData.get("action") as string;

  const apiService = createApiService(shopDomain);

  try {
    switch (action) {
      case "update": {
        const data = {
          name: formData.get("name") as string,
          entityId: formData.get("entityId") as string || undefined,
          ssoUrl: formData.get("ssoUrl") as string || undefined,
          certificate: formData.get("certificate") as string || undefined,
          clientId: formData.get("clientId") as string || undefined,
          clientSecret: formData.get("clientSecret") as string || undefined,
          issuerUrl: formData.get("issuerUrl") as string || undefined,
          jitProvisioning: formData.get("jitProvisioning") === "true",
          enforceForDomain: formData.get("enforceForDomain") as string || undefined,
        };
        await apiService.updateProvider(params.id!, data);
        return json({ success: true, message: "Provider updated" });
      }

      case "activate": {
        await apiService.toggleProviderStatus(params.id!, true);
        return json({ success: true, message: "Provider activated" });
      }

      case "deactivate": {
        await apiService.toggleProviderStatus(params.id!, false);
        return json({ success: true, message: "Provider deactivated" });
      }

      case "delete": {
        await apiService.deleteProvider(params.id!);
        return redirect("/app/sso-providers");
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    return json({ error: error.message || "Action failed" }, { status: 500 });
  }
};

export default function EditSSOProvider() {
  const { provider, recentLogins, appUrl, shopDomain } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedTab, setSelectedTab] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [formState, setFormState] = useState({
    name: provider.name,
    entityId: provider.entityId || "",
    ssoUrl: provider.ssoUrl || "",
    certificate: provider.certificate || "",
    clientId: provider.clientId || "",
    clientSecret: "",
    issuerUrl: provider.issuerUrl || "",
    jitProvisioning: provider.jitProvisioning,
    enforceForDomain: provider.enforceForDomain || "",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  const handleFieldChange = useCallback((field: string, value: string | boolean) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "update");
    Object.entries(formState).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    submit(formData, { method: "post" });
  }, [formState, submit]);

  const handleToggleStatus = useCallback(() => {
    const formData = new FormData();
    formData.append("action", provider.status === "active" ? "deactivate" : "activate");
    submit(formData, { method: "post" });
  }, [provider.status, submit]);

  const handleDelete = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "delete");
    submit(formData, { method: "post" });
    setDeleteModalOpen(false);
  }, [submit]);

  // Configuration test (checks endpoints are reachable)
  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setTestModalOpen(true);
    setTestResult(null);

    try {
      // Use the public-facing app URL (Cloudflare tunnel in dev, production URL in prod)
      const response = await fetch(`${appUrl}/api/providers/${provider.id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Domain': shopDomain,
        },
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setTestResult({
          success: true,
          message: result.message || 'Connection test successful! Provider is configured correctly.',
          details: result.checks || result,
        });
      } else {
        setTestResult({
          success: false,
          message: result.error || result.message || 'Connection test failed. Please check your configuration.',
          details: result,
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: String(error) },
      });
    } finally {
      setIsTesting(false);
    }
  }, [provider.id, shopDomain, appUrl]);

  // Live OAuth test (opens popup to IdP)
  const handleOAuthTest = useCallback(() => {
    // Use the public-facing app URL (Cloudflare tunnel in dev, production URL in prod)
    // This URL comes from the server-side loader
    const testUrl = `${appUrl}/api/providers/${provider.id}/test/oauth`;

    // Open popup window
    const popup = window.open(
      testUrl,
      'sso-test',
      'width=600,height=700,scrollbars=yes,resizable=yes'
    );

    // Listen for result from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sso-test-result') {
        setTestResult({
          success: event.data.success,
          message: event.data.message,
          details: event.data.details,
        });
        setTestModalOpen(true);
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);

    // Also handle popup close without result
    if (popup) {
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
        }
      }, 500);
    }
  }, [provider.id, appUrl]);

  const tabs = [
    { id: "settings", content: "Settings" },
    { id: "activity", content: "Activity" },
  ];

  const getTypeBadge = (type: string) => {
    const typeConfig: Record<string, { label: string; tone: "info" | "success" | "warning" | "attention" }> = {
      saml: { label: "SAML 2.0", tone: "info" },
      oidc: { label: "OIDC", tone: "success" },
      google: { label: "Google", tone: "warning" },
      microsoft: { label: "Microsoft", tone: "attention" },
      github: { label: "GitHub", tone: "info" },
      facebook: { label: "Facebook", tone: "info" },
    };
    const config = typeConfig[type] || { label: type.toUpperCase(), tone: "info" as const };
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };

  // Generate SP details - using the tunnel URL
  const spEntityId = `${appUrl}/api/proxy/saml/metadata`;
  const spAcsUrl = `${appUrl}/api/proxy/auth/saml/callback`;
  // Use providerType if available, otherwise fall back to provider or type
  // This ensures Auth0 uses 'auth0' not 'auth' in the callback URL
  const providerTypeForCallback = provider.providerType || provider.provider || provider.type || 'custom';
  const redirectUri = `${appUrl}/api/auth/oidc/${providerTypeForCallback}/callback`;

  return (
    <Page
      title={provider.name}
      titleMetadata={
        <InlineStack gap="200">
          {getTypeBadge(provider.type)}
          <Badge tone={provider.status === "active" ? "success" : "warning"}>
            {provider.status}
          </Badge>
        </InlineStack>
      }
      backAction={{ content: "SSO Providers", url: "/app/sso-providers" }}
      secondaryActions={[
        {
          content: provider.status === "active" ? "Deactivate" : "Activate",
          onAction: handleToggleStatus,
          loading: isSubmitting,
        },
        {
          content: "Delete",
          destructive: true,
          onAction: () => setDeleteModalOpen(true),
        },
      ]}
      primaryAction={{
        content: "Save",
        onAction: handleSave,
        loading: isSubmitting,
      }}
    >
      <Layout>
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {/* Settings Tab */}
              {selectedTab === 0 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    {/* Provider Details */}
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Provider Details
                      </Text>
                      <FormLayout>
                        <TextField
                          label="Display Name"
                          value={formState.name}
                          onChange={(value) => handleFieldChange("name", value)}
                          autoComplete="off"
                        />
                      </FormLayout>
                    </BlockStack>

                    <Divider />

                    {/* SAML Configuration */}
                    {provider.type === "saml" && (
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          SAML Configuration
                        </Text>

                        <Card>
                          <BlockStack gap="300">
                            <Text as="h3" variant="headingSm">
                              Service Provider (SP) Details
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Configure your identity provider with these values
                            </Text>
                            <DescriptionList
                              items={[
                                {
                                  term: "SP Entity ID",
                                  description: (
                                    <InlineStack gap="200">
                                      <Text as="span" variant="bodyMd" fontWeight="medium">
                                        {spEntityId}
                                      </Text>
                                      <Button
                                        size="slim"
                                        onClick={() => navigator.clipboard.writeText(spEntityId)}
                                      >
                                        Copy
                                      </Button>
                                    </InlineStack>
                                  ),
                                },
                                {
                                  term: "ACS URL",
                                  description: (
                                    <InlineStack gap="200">
                                      <Text as="span" variant="bodyMd" fontWeight="medium">
                                        {spAcsUrl}
                                      </Text>
                                      <Button
                                        size="slim"
                                        onClick={() => navigator.clipboard.writeText(spAcsUrl)}
                                      >
                                        Copy
                                      </Button>
                                    </InlineStack>
                                  ),
                                },
                              ]}
                            />
                          </BlockStack>
                        </Card>

                        <FormLayout>
                          <TextField
                            label="IdP Entity ID"
                            value={formState.entityId}
                            onChange={(value) => handleFieldChange("entityId", value)}
                            autoComplete="off"
                          />
                          <TextField
                            label="IdP SSO URL"
                            value={formState.ssoUrl}
                            onChange={(value) => handleFieldChange("ssoUrl", value)}
                            autoComplete="off"
                          />
                          <TextField
                            label="X.509 Certificate"
                            value={formState.certificate}
                            onChange={(value) => handleFieldChange("certificate", value)}
                            autoComplete="off"
                            multiline={4}
                          />
                        </FormLayout>
                      </BlockStack>
                    )}

                    {/* OIDC Configuration */}
                    {provider.type === "oidc" && (
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          OIDC Configuration
                        </Text>

                        <Banner tone="info">
                          <BlockStack gap="200">
                            <Text as="p" fontWeight="bold">OAuth Redirect URI</Text>
                            <Text as="p" variant="bodySm">Add this redirect URI to your OAuth application settings:</Text>
                            <Card>
                              <BlockStack gap="200">
                                <InlineStack gap="200" align="space-between" blockAlign="center">
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    Copy this URL:
                                  </Text>
                                  <Button
                                    size="slim"
                                    onClick={(e) => {
                                      navigator.clipboard.writeText(redirectUri);
                                      // Show feedback
                                      const btn = e?.target as HTMLElement;
                                      if (btn) {
                                        const originalText = btn.textContent;
                                        btn.textContent = 'Copied!';
                                        setTimeout(() => {
                                          btn.textContent = originalText;
                                        }, 2000);
                                      }
                                    }}
                                  >
                                    Copy
                                  </Button>
                                </InlineStack>
                                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                                  <Text as="p" variant="bodyMd" fontWeight="medium">
                                    {redirectUri}
                                  </Text>
                                </Box>
                              </BlockStack>
                            </Card>
                          </BlockStack>
                        </Banner>

                        <FormLayout>
                          <TextField
                            label="Issuer URL"
                            value={formState.issuerUrl}
                            onChange={(value) => handleFieldChange("issuerUrl", value)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Client ID"
                            value={formState.clientId}
                            onChange={(value) => handleFieldChange("clientId", value)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Client Secret"
                            value={formState.clientSecret}
                            onChange={(value) => handleFieldChange("clientSecret", value)}
                            autoComplete="off"
                            type="password"
                            placeholder={provider.clientSecret ? "••••••••" : ""}
                            helpText="Leave empty to keep current secret"
                          />
                        </FormLayout>
                      </BlockStack>
                    )}

                    {/* Social Provider Configuration */}
                    {["google", "microsoft", "github", "facebook"].includes(provider.type) && (
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          OAuth Configuration
                        </Text>

                        <Banner tone="info">
                          <BlockStack gap="200">
                            <Text as="p" fontWeight="bold">OAuth Redirect URI</Text>
                            <Text as="p" variant="bodySm">Add this redirect URI to your OAuth application settings:</Text>
                            <Card>
                              <BlockStack gap="200">
                                <InlineStack gap="200" align="space-between" blockAlign="center">
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    Copy this URL:
                                  </Text>
                                  <Button
                                    size="slim"
                                    onClick={(e) => {
                                      navigator.clipboard.writeText(redirectUri);
                                      // Show feedback
                                      const btn = e?.target as HTMLElement;
                                      if (btn) {
                                        const originalText = btn.textContent;
                                        btn.textContent = 'Copied!';
                                        setTimeout(() => {
                                          btn.textContent = originalText;
                                        }, 2000);
                                      }
                                    }}
                                  >
                                    Copy
                                  </Button>
                                </InlineStack>
                                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                                  <Text as="p" variant="bodyMd" fontWeight="medium">
                                    {redirectUri}
                                  </Text>
                                </Box>
                              </BlockStack>
                            </Card>
                          </BlockStack>
                        </Banner>

                        <FormLayout>
                          <TextField
                            label="Client ID"
                            value={formState.clientId}
                            onChange={(value) => handleFieldChange("clientId", value)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Client Secret"
                            value={formState.clientSecret}
                            onChange={(value) => handleFieldChange("clientSecret", value)}
                            autoComplete="off"
                            type="password"
                            placeholder={provider.clientSecret ? "••••••••" : ""}
                            helpText="Leave empty to keep current secret"
                          />
                        </FormLayout>
                      </BlockStack>
                    )}

                    <Divider />

                    {/* Advanced Settings */}
                    <Button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      ariaExpanded={showAdvanced}
                      variant="plain"
                    >
                      {showAdvanced ? "Hide" : "Show"} Advanced Settings
                    </Button>
                    <Collapsible open={showAdvanced} id="advanced-settings">
                      <Box paddingBlockStart="400">
                        <FormLayout>
                          <Checkbox
                            label="Enable Just-in-Time (JIT) Provisioning"
                            checked={formState.jitProvisioning}
                            onChange={(value) => handleFieldChange("jitProvisioning", value)}
                            helpText="Automatically create users when they first sign in"
                          />
                          <TextField
                            label="Enforce SSO for Domain"
                            value={formState.enforceForDomain}
                            onChange={(value) => handleFieldChange("enforceForDomain", value)}
                            autoComplete="off"
                            placeholder="acme.com"
                            helpText="Force users with this email domain to use SSO"
                          />
                        </FormLayout>
                      </Box>
                    </Collapsible>
                  </BlockStack>
                </Box>
              )}

              {/* Activity Tab */}
              {selectedTab === 1 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text as="h2" variant="headingMd">
                        Recent Login Activity
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {provider._count?.loginFlows || 0} total login attempts
                      </Text>
                    </InlineStack>

                    {recentLogins.length === 0 ? (
                      <Box padding="400">
                        <Text as="p" tone="subdued" alignment="center">
                          No login activity yet for this provider.
                        </Text>
                      </Box>
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
                              <BlockStack gap="100">
                                <Text as="span" variant="bodyMd" fontWeight="medium">
                                  {login.email || "Unknown user"}
                                </Text>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {login.ipAddress || "Unknown IP"}
                                </Text>
                              </BlockStack>
                              <InlineStack gap="200" blockAlign="center">
                                <Badge
                                  tone={login.status === "success" ? "success" : "critical"}
                                >
                                  {login.status}
                                </Badge>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {new Date(login.initiatedAt).toLocaleString()}
                                </Text>
                              </InlineStack>
                            </InlineStack>
                            {login.errorMessage && (
                              <Box paddingBlockStart="200">
                                <Text as="p" variant="bodySm" tone="critical">
                                  {login.errorMessage}
                                </Text>
                              </Box>
                            )}
                          </Box>
                        ))}
                      </BlockStack>
                    )}
                  </BlockStack>
                </Box>
              )}
            </Tabs>
          </Card>
        </Layout.Section>

        {/* Sidebar */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Stats */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Statistics
                </Text>
                <DescriptionList
                  items={[
                    {
                      term: "Linked Users",
                      description: String(provider._count?.userLinks || 0),
                    },
                    {
                      term: "Login Attempts",
                      description: String(provider._count?.loginFlows || 0),
                    },
                    {
                      term: "Created",
                      description: new Date(provider.createdAt).toLocaleDateString(),
                    },
                    {
                      term: "Last Updated",
                      description: new Date(provider.updatedAt).toLocaleDateString(),
                    },
                  ]}
                />
              </BlockStack>
            </Card>

            {/* Test Connection */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Test Connection
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Verify your configuration or test the full OAuth flow with the identity provider.
                </Text>
                <InlineStack gap="200">
                  <Button onClick={handleTestConnection} loading={isTesting}>
                    Verify Configuration
                  </Button>
                  {(provider.type === 'oidc' || ['google', 'microsoft', 'github', 'facebook', 'auth0'].includes(provider.provider || '')) && (
                    <Button variant="primary" onClick={handleOAuthTest}>
                      Test OAuth Flow
                    </Button>
                  )}
                </InlineStack>
                {testResult && !testModalOpen && (
                  <Banner tone={testResult.success ? "success" : "critical"}>
                    {testResult.message}
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Test Connection Modal */}
      <Modal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        title="Connection Test Results"
        primaryAction={{
          content: testResult?.success ? "Done" : "Close",
          onAction: () => setTestModalOpen(false),
        }}
      >
        <Modal.Section>
          {isTesting ? (
            <BlockStack gap="400" inlineAlign="center">
              <Spinner size="large" />
              <Text as="p">Testing connection to {provider.name}...</Text>
            </BlockStack>
          ) : testResult ? (
            <BlockStack gap="400">
              <Banner tone={testResult.success ? "success" : "critical"}>
                {testResult.message}
              </Banner>
              {testResult.details && (
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Response Details</Text>
                  <Box
                    padding="300"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <pre style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      margin: 0,
                    }}>
                      {JSON.stringify(testResult.details, null, 2)}
                    </pre>
                  </Box>
                </BlockStack>
              )}
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete SSO Provider?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDelete,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">
              Are you sure you want to delete <strong>{provider.name}</strong>?
            </Text>
            <Text as="p" tone="critical">
              This will remove the SSO provider and all {provider._count?.userLinks || 0} linked users
              will no longer be able to sign in using this provider.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
