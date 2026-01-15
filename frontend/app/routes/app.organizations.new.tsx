import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  TextField,
  FormLayout,
  Banner,
  Checkbox,
  Select,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const apiService = createApiService(shopDomain);

  try {
    const providers = await apiService.getProviders();
    return json({ ssoProviders: providers.filter((p: any) => p.status === 'active') });
  } catch (error) {
    return json({ ssoProviders: [] });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

  const apiService = createApiService(shopDomain);

  const data = {
    name: formData.get("name") as string,
    slug: formData.get("slug") as string,
    description: formData.get("description") as string || undefined,
    ssoRequired: formData.get("ssoRequired") === "true",
    defaultRole: formData.get("defaultRole") as string || "member",
  };

  if (!data.name || !data.slug) {
    return json({ error: "Name and slug are required" }, { status: 400 });
  }

  if (!/^[a-z0-9-]+$/.test(data.slug)) {
    return json({ error: "Slug must contain only lowercase letters, numbers, and hyphens" }, { status: 400 });
  }

  try {
    const org = await apiService.createOrganization(data);
    return redirect(`/app/organizations/${org.id}`);
  } catch (error: any) {
    return json({ error: error.message || "Failed to create organization" }, { status: 400 });
  }
};

export default function NewOrganization() {
  const { ssoProviders } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [formState, setFormState] = useState({
    name: "",
    slug: "",
    description: "",
    ssoRequired: false,
    defaultRole: "member",
  });

  const handleFieldChange = useCallback((field: string, value: string | boolean) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    if (field === "name" && typeof value === "string") {
      const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      setFormState((prev) => ({ ...prev, slug }));
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    Object.entries(formState).forEach(([key, value]) => formData.append(key, String(value)));
    submit(formData, { method: "post" });
  }, [formState, submit]);

  return (
    <Page
      title="Create Organization"
      backAction={{ content: "Organizations", url: "/app/organizations" }}
      primaryAction={{
        content: "Create Organization",
        onAction: handleSubmit,
        loading: isSubmitting,
        disabled: !formState.name || !formState.slug,
      }}
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical"><p>{actionData.error}</p></Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Organization Details</Text>
              <FormLayout>
                <TextField
                  label="Organization Name"
                  value={formState.name}
                  onChange={(v) => handleFieldChange("name", v)}
                  autoComplete="off"
                  requiredIndicator
                />
                <TextField
                  label="Slug"
                  value={formState.slug}
                  onChange={(v) => handleFieldChange("slug", v)}
                  autoComplete="off"
                  requiredIndicator
                  helpText="URL-safe identifier"
                />
                <TextField
                  label="Description"
                  value={formState.description}
                  onChange={(v) => handleFieldChange("description", v)}
                  autoComplete="off"
                  multiline={2}
                />
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Settings</Text>
              <FormLayout>
                <Checkbox
                  label="Require SSO for all members"
                  checked={formState.ssoRequired}
                  onChange={(v) => handleFieldChange("ssoRequired", v)}
                  disabled={ssoProviders.length === 0}
                  helpText={ssoProviders.length === 0 ? "No active SSO providers" : "Members must use SSO"}
                />
                <Select
                  label="Default Role"
                  options={[
                    { label: "Member", value: "member" },
                    { label: "Viewer", value: "viewer" },
                    { label: "Admin", value: "admin" },
                  ]}
                  value={formState.defaultRole}
                  onChange={(v) => handleFieldChange("defaultRole", v)}
                />
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
