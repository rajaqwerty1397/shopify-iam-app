import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
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
  FormLayout,
  Banner,
  Divider,
  Checkbox,
  Select,
  Box,
  TextField,
} from "@shopify/polaris";
import { ExternalIcon } from "@shopify/polaris-icons";
import { useState, useCallback, useMemo, useEffect } from "react";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

const defaultSsoButtonSettings = {
  enableSso: true,
  ssoText: 'Sign in with SSO',
  enableGoogle: false,
  enableMicrosoft: false,
  buttonColor: '#000000',
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const storeName = shopDomain.replace('.myshopify.com', '');

  const apiService = createApiService(shopDomain);

  try {
    const [settings, planInfo] = await Promise.all([
      apiService.getSettings().catch(() => ({
        ssoEnabled: true,
        autoRedirectToIdp: false,
        sessionTimeout: '24',
        ssoButtonSettings: defaultSsoButtonSettings,
      })),
      apiService.getCurrentPlan().catch(() => ({
        plan: 'free',
        features: [],
      })),
    ]);

    return json({
      shopDomain,
      storeName,
      settings: {
        ...settings,
        ssoButtonSettings: settings.ssoButtonSettings || defaultSsoButtonSettings,
      },
      currentPlan: planInfo.plan.toUpperCase(),
    });
  } catch (error) {
    console.error('Settings loader error:', error);
    return json({
      shopDomain,
      storeName,
      settings: {
        ssoEnabled: true,
        autoRedirectToIdp: false,
        sessionTimeout: '24',
        ssoButtonSettings: defaultSsoButtonSettings,
      },
      currentPlan: 'FREE',
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

  const settings = {
    ssoEnabled: formData.get("ssoEnabled") === "true",
    autoRedirectToIdp: formData.get("autoRedirectToIdp") === "true",
    sessionTimeout: formData.get("sessionTimeout") as string,
    ssoButtonSettings: {
      enableSso: formData.get("buttonEnableSso") === "true",
      ssoText: formData.get("buttonSsoText") as string || "Sign in with SSO",
      enableGoogle: formData.get("buttonEnableGoogle") === "true",
      enableMicrosoft: formData.get("buttonEnableMicrosoft") === "true",
      buttonColor: formData.get("buttonColor") as string || "#000000",
    },
  };

  const apiService = createApiService(shopDomain);

  try {
    await apiService.updateSettings(settings);
    return json({ success: true, message: "Settings saved successfully" });
  } catch (error) {
    console.error('Settings action error:', error);
    return json({ success: false, message: "Failed to save settings" }, { status: 500 });
  }
};

export default function Settings() {
  const { shopDomain, storeName, settings, currentPlan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Initial form state from server
  const initialFormState = useMemo(() => ({
    ssoEnabled: settings.ssoEnabled,
    autoRedirectToIdp: settings.autoRedirectToIdp,
    sessionTimeout: settings.sessionTimeout,
    buttonEnableSso: settings.ssoButtonSettings.enableSso,
    buttonSsoText: settings.ssoButtonSettings.ssoText,
    buttonEnableGoogle: settings.ssoButtonSettings.enableGoogle,
    buttonEnableMicrosoft: settings.ssoButtonSettings.enableMicrosoft,
    buttonColor: settings.ssoButtonSettings.buttonColor,
  }), [settings]);

  const [formState, setFormState] = useState(initialFormState);

  // Reset form state when settings are successfully saved
  useEffect(() => {
    if (actionData?.success) {
      setFormState(initialFormState);
    }
  }, [actionData?.success, initialFormState]);

  // Check if form has unsaved changes
  const isDirty = useMemo(() => {
    return JSON.stringify(formState) !== JSON.stringify(initialFormState);
  }, [formState, initialFormState]);

  const handleFieldChange = useCallback((field: string, value: string | boolean) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("ssoEnabled", String(formState.ssoEnabled));
    formData.append("autoRedirectToIdp", String(formState.autoRedirectToIdp));
    formData.append("sessionTimeout", formState.sessionTimeout);
    formData.append("buttonEnableSso", String(formState.buttonEnableSso));
    formData.append("buttonSsoText", formState.buttonSsoText);
    formData.append("buttonEnableGoogle", String(formState.buttonEnableGoogle));
    formData.append("buttonEnableMicrosoft", String(formState.buttonEnableMicrosoft));
    formData.append("buttonColor", formState.buttonColor);
    submit(formData, { method: "post" });
  }, [formState, submit]);

  const handleDiscard = useCallback(() => {
    setFormState(initialFormState);
  }, [initialFormState]);

  const sessionTimeoutOptions = [
    { label: "1 hour", value: "1" },
    { label: "4 hours", value: "4" },
    { label: "8 hours", value: "8" },
    { label: "24 hours", value: "24" },
    { label: "7 days", value: "168" },
    { label: "30 days", value: "720" },
  ];

  const themeEditorUrl = `https://admin.shopify.com/store/${storeName}/themes/current/editor?context=apps`;

  return (
    <Page
      title="Settings"
      primaryAction={
        isDirty
          ? {
              content: "Save",
              onAction: handleSave,
              loading: isSubmitting,
            }
          : undefined
      }
      secondaryActions={
        isDirty
          ? [
              {
                content: "Discard",
                onAction: handleDiscard,
                disabled: isSubmitting,
              },
            ]
          : []
      }
    >
      <Layout>
        {/* Success/Error Banner */}
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>
              {actionData.message}
            </Banner>
          </Layout.Section>
        )}

        {actionData?.success === false && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => {}}>
              {actionData.message}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="500">
            {/* SSO Authentication Settings */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">SSO Authentication</Text>
                  <Text as="p" tone="subdued">
                    Configure Single Sign-On settings for your store.
                  </Text>
                </BlockStack>

                <Divider />

                <FormLayout>
                  <Checkbox
                    label="Enable SSO Authentication"
                    checked={formState.ssoEnabled}
                    onChange={(value) => handleFieldChange("ssoEnabled", value)}
                    helpText="Allow customers to sign in using SSO providers"
                  />

                  <Checkbox
                    label="Auto-redirect to Identity Provider"
                    checked={formState.autoRedirectToIdp}
                    onChange={(value) => handleFieldChange("autoRedirectToIdp", value)}
                    helpText="Automatically redirect users to the IdP login page"
                    disabled={!formState.ssoEnabled}
                  />

                  <Select
                    label="Session Timeout"
                    options={sessionTimeoutOptions}
                    value={formState.sessionTimeout}
                    onChange={(value) => handleFieldChange("sessionTimeout", value)}
                    helpText="How long users stay logged in after SSO authentication"
                    disabled={!formState.ssoEnabled}
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            {/* Login Button Customization */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Login Button Customization</Text>
                  <Text as="p" tone="subdued">
                    Configure how the SSO login buttons appear on your store's login page.
                  </Text>
                </BlockStack>

                <Divider />

                <FormLayout>
                  <Checkbox
                    label="Show Enterprise SSO Button"
                    checked={formState.buttonEnableSso}
                    onChange={(value) => handleFieldChange("buttonEnableSso", value)}
                    helpText="Display the main SSO login button"
                  />

                  <TextField
                    label="SSO Button Text"
                    value={formState.buttonSsoText}
                    onChange={(value) => handleFieldChange("buttonSsoText", value)}
                    helpText="The text displayed on the SSO login button"
                    disabled={!formState.buttonEnableSso}
                    autoComplete="off"
                  />

                  <TextField
                    label="Button Color"
                    type="text"
                    value={formState.buttonColor}
                    onChange={(value) => handleFieldChange("buttonColor", value)}
                    helpText="Hex color code (e.g., #000000)"
                    prefix={
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          backgroundColor: formState.buttonColor,
                          borderRadius: '4px',
                          border: '1px solid #ddd',
                        }}
                      />
                    }
                    disabled={!formState.buttonEnableSso}
                    autoComplete="off"
                  />

                  <Checkbox
                    label="Show Google Sign-in Button"
                    checked={formState.buttonEnableGoogle}
                    onChange={(value) => handleFieldChange("buttonEnableGoogle", value)}
                    helpText="Display 'Continue with Google' button (requires Google provider)"
                  />

                  <Checkbox
                    label="Show Microsoft Sign-in Button"
                    checked={formState.buttonEnableMicrosoft}
                    onChange={(value) => handleFieldChange("buttonEnableMicrosoft", value)}
                    helpText="Display 'Continue with Microsoft' button (requires Microsoft provider)"
                  />
                </FormLayout>

                <Divider />

                <Banner tone="info">
                  <BlockStack gap="200">
                    <Text as="p">
                      Enable the app embed in your theme settings for the buttons to appear.
                    </Text>
                    <Button
                      variant="plain"
                      onClick={() => window.open(themeEditorUrl, '_top')}
                    >
                      Open Theme Editor
                    </Button>
                  </BlockStack>
                </Banner>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Sidebar */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Current Plan */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Current Plan</Text>
                <Divider />
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span" variant="headingLg">{currentPlan}</Text>
                  <Badge tone="info">{currentPlan}</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Upgrade to unlock more features.
                </Text>
                <Button url="/app/pricing" fullWidth>
                  View Plans
                </Button>
              </BlockStack>
            </Card>

            {/* Help */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Need Help?</Text>
                <Divider />
                <Text as="p" variant="bodySm" tone="subdued">
                  Check out our setup guides for help configuring SSO.
                </Text>
                <Button variant="plain" url="/app/sso-providers/new">
                  SSO Provider Setup
                </Button>
                <Button variant="plain" url="mailto:support@alintro.com">
                  Contact Support
                </Button>
              </BlockStack>
            </Card>

            {/* Store Info */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Store Information</Text>
                <Divider />
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">Store</Text>
                    <Text as="span" variant="bodySm">{storeName}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">Domain</Text>
                    <Text as="span" variant="bodySm">{shopDomain}</Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
