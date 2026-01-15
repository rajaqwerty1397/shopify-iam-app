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
  InlineGrid,
  ProgressBar,
  Checkbox,
  Collapsible,
  ResourceList,
  ResourceItem,
  Avatar,
  EmptyState,
  Modal,
  Spinner,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

// Provider Templates
const PROVIDER_CATEGORIES = [
  { id: 'saml', label: 'SAML 2.0', description: 'Enterprise SSO with SAML protocol' },
  { id: 'oauth', label: 'OAuth 2.0', description: 'Social login and OAuth providers' },
];

const SAML_PROVIDERS = [
  {
    id: 'azure_ad',
    name: 'Microsoft Entra ID',
    subtitle: 'Azure Active Directory',
    icon: '🔷',
    description: 'Enterprise SSO with Microsoft Azure AD',
    popular: true,
    setupGuide: 'https://learn.microsoft.com/entra/identity/saas-apps/',
  },
  {
    id: 'okta',
    name: 'Okta',
    subtitle: 'Okta Identity',
    icon: '🔐',
    description: 'Enterprise SSO with Okta',
    popular: true,
    setupGuide: 'https://help.okta.com/en-us/content/topics/apps/apps_app_integration_wizard_saml.htm',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    subtitle: 'Salesforce Identity',
    icon: '☁️',
    description: 'Enterprise SSO with Salesforce',
    popular: true,
    setupGuide: 'https://help.salesforce.com/s/articleView?id=sf.identity_provider_about.htm',
  },
  {
    id: 'onelogin',
    name: 'OneLogin',
    subtitle: 'OneLogin SSO',
    icon: '🔑',
    description: 'Enterprise SSO with OneLogin',
    popular: false,
    setupGuide: 'https://developers.onelogin.com/saml',
  },
  {
    id: 'custom_saml',
    name: 'Custom SAML',
    subtitle: 'Any SAML 2.0 Provider',
    icon: '⚙️',
    description: 'Configure any SAML 2.0 compliant IdP',
    popular: false,
    setupGuide: '',
  },
];

const OAUTH_PROVIDERS = [
  {
    id: 'google',
    name: 'Google',
    subtitle: 'Google Workspace / Gmail',
    icon: '🔴',
    description: 'Sign in with Google accounts',
    popular: true,
    setupGuide: 'https://developers.google.com/identity/gsi/web/guides/overview',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    subtitle: 'Facebook Login',
    icon: '🔵',
    description: 'Sign in with Facebook accounts',
    popular: true,
    setupGuide: 'https://developers.facebook.com/docs/facebook-login/web',
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    subtitle: 'Microsoft Account',
    icon: '🟦',
    description: 'Sign in with Microsoft accounts',
    popular: true,
    setupGuide: 'https://learn.microsoft.com/entra/identity-platform/quickstart-register-app',
  },
  {
    id: 'auth0',
    name: 'Auth0',
    subtitle: 'Auth0 by Okta',
    icon: '🔐',
    description: 'Sign in with Auth0 identity platform',
    popular: true,
    setupGuide: 'https://auth0.com/docs/get-started/applications',
    requiresIssuerUrl: true,
  },
  {
    id: 'custom_oauth',
    name: 'Custom OAuth',
    subtitle: 'Any OAuth 2.0 Provider',
    icon: '⚙️',
    description: 'Configure any OAuth 2.0 compliant provider',
    popular: false,
    setupGuide: '',
    requiresIssuerUrl: true,
  },
];

const STEPS = [
  { id: 1, title: 'Choose Provider Type' },
  { id: 2, title: 'Provider Details' },
  { id: 3, title: 'Configuration' },
  { id: 4, title: 'Test & Activate' },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Use OAUTH_CALLBACK_URL (Cloudflare tunnel) for OAuth callbacks
  // Falls back to SHOPIFY_APP_URL if not set
  // This is the URL that OAuth providers will redirect to after authentication
  const oauthCallbackUrl = process.env.OAUTH_CALLBACK_URL || process.env.SHOPIFY_APP_URL || process.env.APP_URL || 'https://localhost:3000';
  const appUrl = process.env.SHOPIFY_APP_URL || process.env.APP_URL || 'https://localhost:3000';

  // The SAML callback URLs use the app URL
  const callbackBaseUrl = `${oauthCallbackUrl}/api/proxy`;

  return json({
    shopDomain: session.shop,
    appUrl,
    spMetadata: {
      entityId: `${callbackBaseUrl}/saml/metadata`,
      acsUrl: `${callbackBaseUrl}/auth/saml/callback`,
      sloUrl: `${callbackBaseUrl}/auth/saml/logout`,
    },
    // OAuth callbacks use the Cloudflare tunnel URL (directly to backend)
    oauthCallbacks: {
      google: `${oauthCallbackUrl}/api/auth/oidc/google/callback`,
      facebook: `${oauthCallbackUrl}/api/auth/oidc/facebook/callback`,
      microsoft: `${oauthCallbackUrl}/api/auth/oidc/microsoft/callback`,
      auth0: `${oauthCallbackUrl}/api/auth/oidc/auth0/callback`,
      custom: `${oauthCallbackUrl}/api/auth/oidc/custom/callback`,
      custom_oauth: `${oauthCallbackUrl}/api/auth/oidc/custom_oauth/callback`,
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const providerData = {
    shopDomain: session.shop,
    name: formData.get("name") as string,
    type: formData.get("type") as string,
    provider: formData.get("provider") as string,
    status: formData.get("status") as string || "draft",
    config: {
      // SAML fields
      entityId: formData.get("entityId") as string,
      ssoUrl: formData.get("ssoUrl") as string,
      certificate: formData.get("certificate") as string,
      // OAuth fields
      clientId: formData.get("clientId") as string,
      clientSecret: formData.get("clientSecret") as string,
      issuerUrl: formData.get("issuerUrl") as string,
      // Common
      jitProvisioning: formData.get("jitProvisioning") === "true",
    },
  };

  // Validation
  if (!providerData.name || !providerData.type) {
    return json({ error: "Name and type are required" }, { status: 400 });
  }

  try {
    // Create API service and save provider
    const apiService = createApiService(session.shop);
    await apiService.createProvider(providerData);

    return redirect(`/app/sso-providers`);
  } catch (error) {
    console.error('Error creating provider:', error);
    return json({ error: "Failed to create provider. Please try again." }, { status: 500 });
  }
};

export default function NewSSOProvider() {
  const { shopDomain, appUrl, spMetadata, oauthCallbacks } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Form state
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [formState, setFormState] = useState({
    name: '',
    // SAML
    entityId: '',
    ssoUrl: '',
    certificate: '',
    // OAuth
    clientId: '',
    clientSecret: '',
    issuerUrl: '',
    // Common
    jitProvisioning: true,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const handleFieldChange = useCallback((field: string, value: string | boolean) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSelectCategory = useCallback((category: string) => {
    setSelectedCategory(category);
    setSelectedProvider('');
  }, []);

  const handleSelectProvider = useCallback((providerId: string) => {
    setSelectedProvider(providerId);
    const providers = selectedCategory === 'saml' ? SAML_PROVIDERS : OAUTH_PROVIDERS;
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      handleFieldChange('name', provider.name);
    }
    setCurrentStep(2);
  }, [selectedCategory, handleFieldChange]);

  const handleNext = useCallback(() => {
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    } else if (selectedProvider) {
      setSelectedProvider('');
    } else if (selectedCategory) {
      setSelectedCategory('');
    }
  }, [currentStep, selectedProvider, selectedCategory]);

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setTestModalOpen(true);
    setTestResult(null);

    try {
      // Build test payload based on provider type
      const testPayload = {
        type: selectedCategory,
        provider: selectedProvider,
        config: selectedCategory === 'saml'
          ? {
              entityId: formState.entityId,
              ssoUrl: formState.ssoUrl,
              certificate: formState.certificate,
            }
          : {
              clientId: formState.clientId,
              clientSecret: formState.clientSecret,
            },
      };

      // Use the public-facing app URL (Cloudflare tunnel in dev, production URL in prod)
      const response = await fetch(`${appUrl}/api/providers/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Domain': shopDomain,
        },
        body: JSON.stringify(testPayload),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setTestResult({
          success: true,
          message: 'Connection successful! Provider is configured correctly.',
          details: result.details || result,
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
  }, [selectedCategory, selectedProvider, formState, shopDomain, appUrl]);

  const handleSubmit = useCallback((status: string = 'draft') => {
    const formData = new FormData();
    formData.append("name", formState.name);
    formData.append("type", selectedCategory);
    formData.append("provider", selectedProvider);
    formData.append("status", status);
    formData.append("entityId", formState.entityId);
    formData.append("ssoUrl", formState.ssoUrl);
    formData.append("certificate", formState.certificate);
    formData.append("clientId", formState.clientId);
    formData.append("clientSecret", formState.clientSecret);
    formData.append("issuerUrl", formState.issuerUrl);
    formData.append("jitProvisioning", String(formState.jitProvisioning));
    submit(formData, { method: "post" });
  }, [formState, selectedCategory, selectedProvider, submit]);

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return !!selectedProvider;
      case 2:
        return !!formState.name;
      case 3:
        if (selectedCategory === 'saml') {
          return !!formState.entityId && !!formState.ssoUrl;
        }
        // For auth0 and custom_oauth, also require issuerUrl
        if (selectedProvider === 'auth0' || selectedProvider === 'custom_oauth') {
          return !!formState.clientId && !!formState.clientSecret && !!formState.issuerUrl;
        }
        return !!formState.clientId && !!formState.clientSecret;
      default:
        return true;
    }
  };

  const progressPercent = (currentStep / STEPS.length) * 100;

  const getProviderInfo = () => {
    const providers = selectedCategory === 'saml' ? SAML_PROVIDERS : OAUTH_PROVIDERS;
    return providers.find(p => p.id === selectedProvider);
  };

  return (
    <Page
      title="Add SSO Provider"
      backAction={{ content: "SSO Providers", url: "/app/sso-providers" }}
      subtitle={selectedProvider ? getProviderInfo()?.name : "Choose your Identity Provider"}
    >
      {actionData?.error && (
        <Banner tone="critical" title="Error">
          {actionData.error}
        </Banner>
      )}

      <Layout>
        {/* Progress Indicator */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                {STEPS.map((step) => (
                  <Box key={step.id} width="25%">
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone={currentStep >= step.id ? "success" : undefined}>
                          {step.id}
                        </Badge>
                        <Text as="span" variant="bodySm" fontWeight={currentStep === step.id ? "bold" : "regular"}>
                          {step.title}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                ))}
              </InlineStack>
              <ProgressBar progress={progressPercent} size="small" tone="primary" />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {/* Step 1: Choose Provider Type */}
          {currentStep === 1 && !selectedCategory && (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Select Authentication Protocol
                </Text>
                <Text as="p" tone="subdued">
                  Choose the type of authentication you want to configure.
                </Text>
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                  {PROVIDER_CATEGORIES.map((category) => (
                    <div
                      key={category.id}
                      onClick={() => handleSelectCategory(category.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Card>
                        <BlockStack gap="200">
                          <Text as="h3" variant="headingMd">
                            {category.label}
                          </Text>
                          <Text as="p" tone="subdued">
                            {category.description}
                          </Text>
                          <Button fullWidth>
                            Select {category.label}
                          </Button>
                        </BlockStack>
                      </Card>
                    </div>
                  ))}
                </InlineGrid>
              </BlockStack>
            </Card>
          )}

          {/* Step 1: Choose Provider (after category selected) */}
          {currentStep === 1 && selectedCategory && !selectedProvider && (
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Select {selectedCategory === 'saml' ? 'SAML' : 'OAuth'} Provider
                  </Text>
                  <Button variant="plain" onClick={() => setSelectedCategory('')}>
                    Change Protocol
                  </Button>
                </InlineStack>
                
                <Text as="p" tone="subdued">
                  Choose your Identity Provider from the list below, or configure a custom provider.
                </Text>

                {/* Popular Providers */}
                <Text as="h3" variant="headingSm">Popular Providers</Text>
                <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
                  {(selectedCategory === 'saml' ? SAML_PROVIDERS : OAUTH_PROVIDERS)
                    .filter(p => p.popular)
                    .map((provider) => (
                      <div
                        key={provider.id}
                        onClick={() => handleSelectProvider(provider.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Card>
                          <BlockStack gap="200">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" variant="headingLg">{provider.icon}</Text>
                              <BlockStack gap="100">
                                <Text as="h4" variant="headingSm">{provider.name}</Text>
                                <Text as="p" variant="bodySm" tone="subdued">{provider.subtitle}</Text>
                              </BlockStack>
                            </InlineStack>
                          </BlockStack>
                        </Card>
                      </div>
                    ))}
                </InlineGrid>

                <Divider />

                {/* Other Providers */}
                <Text as="h3" variant="headingSm">Other Options</Text>
                <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
                  {(selectedCategory === 'saml' ? SAML_PROVIDERS : OAUTH_PROVIDERS)
                    .filter(p => !p.popular)
                    .map((provider) => (
                      <div
                        key={provider.id}
                        onClick={() => handleSelectProvider(provider.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Card>
                          <BlockStack gap="200">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" variant="headingLg">{provider.icon}</Text>
                              <BlockStack gap="100">
                                <Text as="h4" variant="headingSm">{provider.name}</Text>
                                <Text as="p" variant="bodySm" tone="subdued">{provider.subtitle}</Text>
                              </BlockStack>
                            </InlineStack>
                          </BlockStack>
                        </Card>
                      </div>
                    ))}
                </InlineGrid>
              </BlockStack>
            </Card>
          )}

          {/* Step 2: Provider Details */}
          {currentStep === 2 && (
            <Card>
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
                    requiredIndicator
                    helpText="This name will be shown on the login button"
                  />
                </FormLayout>

                <Divider />
                <InlineStack align="end" gap="200">
                  <Button onClick={handleBack}>Back</Button>
                  <Button variant="primary" onClick={handleNext} disabled={!canProceed()}>
                    Continue
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* Step 3: Configuration */}
          {currentStep === 3 && (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Configuration
                </Text>

                {/* SAML Configuration */}
                {selectedCategory === 'saml' && (
                  <BlockStack gap="400">
                    <Banner tone="info">
                      <BlockStack gap="200">
                        <Text as="p" fontWeight="bold">Service Provider (SP) Metadata</Text>
                        <Text as="p">Configure your Identity Provider with these values:</Text>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm">
                            <strong>Entity ID:</strong> {spMetadata.entityId}
                          </Text>
                          <Text as="p" variant="bodySm">
                            <strong>ACS URL:</strong> {spMetadata.acsUrl}
                          </Text>
                          <Text as="p" variant="bodySm">
                            <strong>Single Logout URL:</strong> {spMetadata.sloUrl}
                          </Text>
                        </BlockStack>
                      </BlockStack>
                    </Banner>

                    {getProviderInfo()?.setupGuide && (
                      <Button
                        variant="plain"
                        onClick={() => window.open(getProviderInfo()?.setupGuide, '_blank')}
                      >
                        View {getProviderInfo()?.name} Setup Guide →
                      </Button>
                    )}

                    <FormLayout>
                      <TextField
                        label="Identity Provider Entity ID"
                        value={formState.entityId}
                        onChange={(value) => handleFieldChange("entityId", value)}
                        autoComplete="off"
                        requiredIndicator
                        placeholder="https://idp.example.com/metadata"
                        helpText="Also known as Issuer URL"
                      />
                      <TextField
                        label="SSO URL (Login Endpoint)"
                        value={formState.ssoUrl}
                        onChange={(value) => handleFieldChange("ssoUrl", value)}
                        autoComplete="off"
                        requiredIndicator
                        placeholder="https://idp.example.com/sso"
                      />
                      <TextField
                        label="X.509 Certificate"
                        value={formState.certificate}
                        onChange={(value) => handleFieldChange("certificate", value)}
                        autoComplete="off"
                        multiline={4}
                        helpText="Paste the IdP's X.509 certificate (PEM format)"
                        placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                      />
                    </FormLayout>
                  </BlockStack>
                )}

                {/* OAuth Configuration */}
                {selectedCategory === 'oauth' && (
                  <BlockStack gap="400">
                    <Banner tone="info">
                      <BlockStack gap="200">
                        <Text as="p" fontWeight="bold">⚠️ Important: Add this Redirect URI to your OAuth App</Text>
                        <Text as="p">Copy the redirect URI below and add it to your OAuth application settings (Google Cloud Console, Microsoft Azure, etc.):</Text>
                        <Card>
                          <BlockStack gap="200">
                            <InlineStack gap="200" align="space-between" blockAlign="center">
                              <Text as="span" variant="bodyMd" fontWeight="medium" tone="subdued">
                                Redirect URI:
                              </Text>
                              <Button
                                size="slim"
                                onClick={(e) => {
                                  const uri = oauthCallbacks[selectedProvider as keyof typeof oauthCallbacks] || oauthCallbacks.custom;
                                  navigator.clipboard.writeText(uri);
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
                                {oauthCallbacks[selectedProvider as keyof typeof oauthCallbacks] || oauthCallbacks.custom}
                              </Text>
                            </Box>
                          </BlockStack>
                        </Card>
                      </BlockStack>
                    </Banner>

                    {getProviderInfo()?.setupGuide && (
                      <Button
                        variant="plain"
                        onClick={() => window.open(getProviderInfo()?.setupGuide, '_blank')}
                      >
                        View {getProviderInfo()?.name} Setup Guide →
                      </Button>
                    )}

                    <FormLayout>
                      <TextField
                        label="Client ID"
                        value={formState.clientId}
                        onChange={(value) => handleFieldChange("clientId", value)}
                        autoComplete="off"
                        requiredIndicator
                        helpText={`Your ${getProviderInfo()?.name || 'OAuth'} application Client ID`}
                      />
                      <TextField
                        label="Client Secret"
                        value={formState.clientSecret}
                        onChange={(value) => handleFieldChange("clientSecret", value)}
                        autoComplete="off"
                        requiredIndicator
                        type="password"
                        helpText={`Your ${getProviderInfo()?.name || 'OAuth'} application Client Secret`}
                      />
                      {/* Issuer URL for Auth0 and custom OAuth providers */}
                      {(selectedProvider === 'auth0' || selectedProvider === 'custom_oauth') && (
                        <TextField
                          label="Issuer URL / Domain"
                          value={formState.issuerUrl}
                          onChange={(value) => handleFieldChange("issuerUrl", value)}
                          autoComplete="off"
                          requiredIndicator
                          placeholder={selectedProvider === 'auth0' ? 'https://your-tenant.auth0.com' : 'https://auth.example.com'}
                          helpText={selectedProvider === 'auth0'
                            ? 'Your Auth0 domain (e.g., https://your-tenant.auth0.com)'
                            : 'The OIDC issuer URL (must support /.well-known/openid-configuration)'}
                        />
                      )}
                    </FormLayout>
                  </BlockStack>
                )}

                {/* Advanced Settings */}
                <Divider />
                <Button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  ariaExpanded={showAdvanced}
                  ariaControls="advanced-settings"
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
                        helpText="Automatically create user accounts when they first sign in via SSO"
                      />
                    </FormLayout>
                  </Box>
                </Collapsible>

                <Divider />
                <InlineStack align="end" gap="200">
                  <Button onClick={handleBack}>Back</Button>
                  <Button variant="primary" onClick={handleNext} disabled={!canProceed()}>
                    Continue
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* Step 4: Test & Activate */}
          {currentStep === 4 && (
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Test & Activate
                </Text>

                <Banner tone="warning">
                  <p>
                    Before activating, we recommend testing the SSO connection to ensure everything
                    is configured correctly.
                  </p>
                </Banner>

                {/* Configuration Summary */}
                <Card>
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">
                      Configuration Summary
                    </Text>
                    <InlineStack gap="400">
                      <Text as="span" fontWeight="medium">Provider:</Text>
                      <InlineStack gap="200">
                        <Text as="span">{getProviderInfo()?.icon}</Text>
                        <Text as="span">{formState.name}</Text>
                      </InlineStack>
                    </InlineStack>
                    <InlineStack gap="400">
                      <Text as="span" fontWeight="medium">Type:</Text>
                      <Badge>{selectedCategory.toUpperCase()}</Badge>
                    </InlineStack>
                    <InlineStack gap="400">
                      <Text as="span" fontWeight="medium">JIT Provisioning:</Text>
                      <Badge tone={formState.jitProvisioning ? "success" : "new"}>
                        {formState.jitProvisioning ? "Enabled" : "Disabled"}
                      </Badge>
                    </InlineStack>
                  </BlockStack>
                </Card>

                {/* Test Result Banner */}
                {testResult && !testModalOpen && (
                  <Banner tone={testResult.success ? "success" : "critical"}>
                    {testResult.message}
                  </Banner>
                )}

                <InlineStack gap="200">
                  <Button onClick={handleTestConnection} loading={isTesting}>
                    Test Connection
                  </Button>
                  {testResult && (
                    <Button variant="plain" onClick={() => setTestModalOpen(true)}>
                      View Details
                    </Button>
                  )}
                </InlineStack>

                {/* Test Connection Modal */}
                <Modal
                  open={testModalOpen}
                  onClose={() => setTestModalOpen(false)}
                  title="Connection Test Results"
                  primaryAction={
                    testResult?.success
                      ? {
                          content: "Continue",
                          onAction: () => setTestModalOpen(false),
                        }
                      : {
                          content: "Close",
                          onAction: () => setTestModalOpen(false),
                        }
                  }
                >
                  <Modal.Section>
                    {isTesting ? (
                      <BlockStack gap="400" inlineAlign="center">
                        <Spinner size="large" />
                        <Text as="p">Testing connection to {getProviderInfo()?.name || 'provider'}...</Text>
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

                <Divider />
                <InlineStack align="end" gap="200">
                  <Button onClick={handleBack}>Back</Button>
                  <Button onClick={() => handleSubmit('draft')} loading={isSubmitting}>
                    Save as Draft
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => handleSubmit('active')}
                    loading={isSubmitting}
                    disabled={!testResult?.success}
                  >
                    Save & Activate
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
