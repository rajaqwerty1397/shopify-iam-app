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
  Select,
  Checkbox,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const apiService = createApiService(shopDomain);

  try {
    const organizations = await apiService.getOrganizations();
    return json({ organizations });
  } catch (error) {
    return json({ organizations: [] });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

  const apiService = createApiService(shopDomain);

  const email = (formData.get("email") as string).toLowerCase().trim();
  if (!email) {
    return json({ error: "Email is required" }, { status: 400 });
  }

  const data = {
    email,
    firstName: formData.get("firstName") as string || undefined,
    lastName: formData.get("lastName") as string || undefined,
    organizationId: formData.get("organizationId") as string || undefined,
    role: formData.get("role") as string || "member",
    status: formData.get("sendInvite") === "true" ? "pending" : "active",
  };

  try {
    const user = await apiService.createUser(data);
    return redirect(`/app/users/${user.id}`);
  } catch (error: any) {
    return json({ error: error.message || "Failed to create user" }, { status: 400 });
  }
};

export default function NewUser() {
  const { organizations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [formState, setFormState] = useState({
    email: "",
    firstName: "",
    lastName: "",
    organizationId: "",
    role: "member",
    sendInvite: true,
  });

  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    Object.entries(formState).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    submit(formData, { method: "post" });
  }, [formState, submit]);

  const roleOptions = [
    { label: "Member", value: "member" },
    { label: "Viewer", value: "viewer" },
    { label: "Admin", value: "admin" },
  ];

  return (
    <Page
      title="Add User"
      backAction={{ content: "Users", url: "/app/users" }}
      primaryAction={{
        content: "Create User",
        onAction: handleSubmit,
        loading: isSubmitting,
        disabled: !formState.email,
      }}
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">User Details</Text>
              <FormLayout>
                <TextField
                  label="Email"
                  type="email"
                  value={formState.email}
                  onChange={(v) => setFormState((p) => ({ ...p, email: v }))}
                  autoComplete="off"
                  requiredIndicator
                />
                <FormLayout.Group>
                  <TextField
                    label="First Name"
                    value={formState.firstName}
                    onChange={(v) => setFormState((p) => ({ ...p, firstName: v }))}
                    autoComplete="off"
                  />
                  <TextField
                    label="Last Name"
                    value={formState.lastName}
                    onChange={(v) => setFormState((p) => ({ ...p, lastName: v }))}
                    autoComplete="off"
                  />
                </FormLayout.Group>
                <Select
                  label="Organization"
                  options={[
                    { label: "None", value: "" },
                    ...organizations.map((o) => ({ label: o.name, value: o.id })),
                  ]}
                  value={formState.organizationId}
                  onChange={(v) => setFormState((p) => ({ ...p, organizationId: v }))}
                />
                <Select
                  label="Role"
                  options={roleOptions}
                  value={formState.role}
                  onChange={(v) => setFormState((p) => ({ ...p, role: v }))}
                />
                <Checkbox
                  label="Send invite email"
                  checked={formState.sendInvite}
                  onChange={(v) => setFormState((p) => ({ ...p, sendInvite: v }))}
                  helpText="User will receive an email to set up their account"
                />
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">About Users</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Users can sign in via SSO or be managed manually. When SSO is configured, 
                users are typically created automatically through Just-in-Time provisioning.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
