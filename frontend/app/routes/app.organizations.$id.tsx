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
  Tabs,
  Checkbox,
  Select,
  Modal,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const apiService = createApiService(shopDomain);

  try {
    const [organization, providers] = await Promise.all([
      apiService.getOrganization(params.id!),
      apiService.getProviders().catch(() => []),
    ]);
    return json({ organization, ssoProviders: providers.filter((p: any) => p.status === 'active') });
  } catch (error) {
    throw new Response("Organization not found", { status: 404 });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const action = formData.get("action");

  const apiService = createApiService(shopDomain);

  try {
    switch (action) {
      case "update": {
        const data = {
          name: formData.get("name") as string,
          description: formData.get("description") as string || undefined,
          ssoRequired: formData.get("ssoRequired") === "true",
          defaultRole: formData.get("defaultRole") as string,
        };
        await apiService.updateOrganization(params.id!, data);
        return json({ success: true, message: "Organization updated" });
      }
      case "delete": {
        await apiService.deleteOrganization(params.id!);
        return redirect("/app/organizations");
      }
      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    return json({ error: error.message || "Action failed" }, { status: 500 });
  }
};

export default function OrganizationDetail() {
  const { organization, ssoProviders } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedTab, setSelectedTab] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [formState, setFormState] = useState({
    name: organization.name,
    description: organization.description || "",
    ssoRequired: organization.ssoRequired,
    defaultRole: organization.defaultRole,
  });

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "update");
    Object.entries(formState).forEach(([key, value]) => formData.append(key, String(value)));
    submit(formData, { method: "post" });
  }, [formState, submit]);

  const handleDelete = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "delete");
    submit(formData, { method: "post" });
    setDeleteModalOpen(false);
  }, [submit]);

  const tabs = [
    { id: "settings", content: "Settings" },
    { id: "members", content: `Members (${organization.userCount || 0})` },
  ];

  return (
    <Page
      title={organization.name}
      titleMetadata={<Badge>{organization.slug}</Badge>}
      backAction={{ content: "Organizations", url: "/app/organizations" }}
      secondaryActions={[{ content: "Delete", destructive: true, onAction: () => setDeleteModalOpen(true) }]}
      primaryAction={{ content: "Save", onAction: handleSave, loading: isSubmitting }}
    >
      <Layout>
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}><p>{actionData.message}</p></Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {selectedTab === 0 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    <Text as="h2" variant="headingMd">Organization Settings</Text>
                    <FormLayout>
                      <TextField
                        label="Name"
                        value={formState.name}
                        onChange={(v) => setFormState((p) => ({ ...p, name: v }))}
                        autoComplete="off"
                      />
                      <TextField
                        label="Description"
                        value={formState.description}
                        onChange={(v) => setFormState((p) => ({ ...p, description: v }))}
                        autoComplete="off"
                        multiline={2}
                      />
                      <Checkbox
                        label="Require SSO for all members"
                        checked={formState.ssoRequired}
                        onChange={(v) => setFormState((p) => ({ ...p, ssoRequired: v }))}
                        disabled={ssoProviders.length === 0}
                      />
                      <Select
                        label="Default Role"
                        options={[
                          { label: "Member", value: "member" },
                          { label: "Viewer", value: "viewer" },
                          { label: "Admin", value: "admin" },
                        ]}
                        value={formState.defaultRole}
                        onChange={(v) => setFormState((p) => ({ ...p, defaultRole: v }))}
                      />
                    </FormLayout>
                  </BlockStack>
                </Box>
              )}

              {selectedTab === 1 && (
                <Box padding="400">
                  <Text as="p" tone="subdued" alignment="center">
                    View and manage members in the Users section.
                  </Text>
                  <Box paddingBlockStart="400">
                    <Button url="/app/users">Go to Users</Button>
                  </Box>
                </Box>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Organization?"
        primaryAction={{ content: "Delete", destructive: true, onAction: handleDelete }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">Are you sure you want to delete <strong>{organization.name}</strong>?</Text>
            <Text as="p" tone="critical">Members will be removed but not deleted.</Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
