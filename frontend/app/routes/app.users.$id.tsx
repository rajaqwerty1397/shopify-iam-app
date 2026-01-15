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
  Select,
  DescriptionList,
  Avatar,
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
    const user = await apiService.getUser(params.id!);
    // Add defaults for properties the UI expects
    const userWithDefaults = {
      ...user,
      ssoLinks: [],
      sessions: [],
      role: 'member',
      organizationId: '',
      avatarUrl: null,
      emailVerified: true,
      mfaEnabled: false,
      lastLoginAt: user.lastLogin || null,
    };
    return json({ user: userWithDefaults, organizations: [], recentActivity: [] });
  } catch (error) {
    throw new Response("User not found", { status: 404 });
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
          firstName: formData.get("firstName") as string || undefined,
          lastName: formData.get("lastName") as string || undefined,
          organizationId: formData.get("organizationId") as string || undefined,
          role: formData.get("role") as string,
          status: formData.get("status") as string,
        };
        await apiService.updateUser(params.id!, data);
        return json({ success: true, message: "User updated" });
      }

      case "suspend": {
        await apiService.updateUser(params.id!, { status: "suspended" });
        return json({ success: true, message: "User suspended" });
      }

      case "activate": {
        await apiService.updateUser(params.id!, { status: "active" });
        return json({ success: true, message: "User activated" });
      }

      case "delete": {
        await apiService.deleteUser(params.id!);
        return redirect("/app/users");
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    return json({ error: error.message || "Action failed" }, { status: 500 });
  }
};

export default function UserDetail() {
  const { user, organizations, recentActivity } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedTab, setSelectedTab] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [formState, setFormState] = useState({
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    organizationId: user.organizationId || "",
    role: user.role,
    status: user.status,
  });

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "update");
    Object.entries(formState).forEach(([key, value]) => {
      formData.append(key, value);
    });
    submit(formData, { method: "post" });
  }, [formState, submit]);

  const handleStatusToggle = useCallback(() => {
    const formData = new FormData();
    formData.append("action", user.status === "suspended" ? "activate" : "suspend");
    submit(formData, { method: "post" });
  }, [user.status, submit]);

  const handleDelete = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "delete");
    submit(formData, { method: "post" });
    setDeleteModalOpen(false);
  }, [submit]);

  const handleRevokeSessions = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "revokeSessions");
    submit(formData, { method: "post" });
  }, [submit]);

  const tabs = [
    { id: "details", content: "Details" },
    { id: "sso", content: "SSO Connections" },
    { id: "sessions", content: "Sessions" },
    { id: "activity", content: "Activity" },
  ];

  const getStatusBadge = (status: string) => {
    const tones: Record<string, "success" | "warning" | "critical" | "new"> = {
      active: "success",
      pending: "warning",
      suspended: "critical",
      inactive: "new",
    };
    return <Badge tone={tones[status] || "new"}>{status}</Badge>;
  };

  const displayName = user.firstName || user.lastName
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
    : user.email;

  return (
    <Page
      title={displayName}
      titleMetadata={getStatusBadge(user.status)}
      backAction={{ content: "Users", url: "/app/users" }}
      secondaryActions={[
        {
          content: user.status === "suspended" ? "Activate" : "Suspend",
          onAction: handleStatusToggle,
          loading: isSubmitting,
        },
        { content: "Delete", destructive: true, onAction: () => setDeleteModalOpen(true) },
      ]}
      primaryAction={{ content: "Save", onAction: handleSave, loading: isSubmitting }}
    >
      <Layout>
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {selectedTab === 0 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    <InlineStack gap="400" blockAlign="center">
                      <Avatar customer size="xl" name={displayName} source={user.avatarUrl || undefined} />
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingLg">{displayName}</Text>
                        <Text as="p" tone="subdued">{user.email}</Text>
                      </BlockStack>
                    </InlineStack>
                    <Divider />
                    <FormLayout>
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
                        options={[
                          { label: "Member", value: "member" },
                          { label: "Viewer", value: "viewer" },
                          { label: "Admin", value: "admin" },
                        ]}
                        value={formState.role}
                        onChange={(v) => setFormState((p) => ({ ...p, role: v }))}
                      />
                    </FormLayout>
                  </BlockStack>
                </Box>
              )}

              {selectedTab === 1 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">SSO Connections</Text>
                    {user.ssoLinks.length === 0 ? (
                      <Text as="p" tone="subdued">No SSO connections for this user.</Text>
                    ) : (
                      <BlockStack gap="300">
                        {user.ssoLinks.map((link) => (
                          <Card key={link.id}>
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="100">
                                <Text as="span" fontWeight="semibold">{link.ssoProvider.name}</Text>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {link.ssoProvider.type.toUpperCase()} • {link.externalEmail || link.externalUserId}
                                </Text>
                              </BlockStack>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Linked {new Date(link.linkedAt).toLocaleDateString()}
                              </Text>
                            </InlineStack>
                          </Card>
                        ))}
                      </BlockStack>
                    )}
                  </BlockStack>
                </Box>
              )}

              {selectedTab === 2 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text as="h2" variant="headingMd">Active Sessions</Text>
                      <Button onClick={handleRevokeSessions} loading={isSubmitting}>
                        Revoke All
                      </Button>
                    </InlineStack>
                    {user.sessions.length === 0 ? (
                      <Text as="p" tone="subdued">No active sessions.</Text>
                    ) : (
                      <BlockStack gap="300">
                        {user.sessions.map((sess) => (
                          <Card key={sess.id}>
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="100">
                                <Text as="span" fontWeight="semibold">{sess.ipAddress || "Unknown IP"}</Text>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {sess.userAgent?.substring(0, 50) || "Unknown device"}
                                </Text>
                              </BlockStack>
                              <Badge tone={sess.isActive ? "success" : "new"}>
                                {sess.isActive ? "Active" : "Expired"}
                              </Badge>
                            </InlineStack>
                          </Card>
                        ))}
                      </BlockStack>
                    )}
                  </BlockStack>
                </Box>
              )}

              {selectedTab === 3 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Recent Activity</Text>
                    {recentActivity.length === 0 ? (
                      <Text as="p" tone="subdued">No recent activity.</Text>
                    ) : (
                      <BlockStack gap="300">
                        {recentActivity.map((log) => (
                          <Box key={log.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                            <InlineStack align="space-between">
                              <BlockStack gap="100">
                                <Text as="span" fontWeight="medium">{log.action}</Text>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {log.description || log.resource}
                                </Text>
                              </BlockStack>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {new Date(log.createdAt).toLocaleString()}
                              </Text>
                            </InlineStack>
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

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">User Info</Text>
              <DescriptionList
                items={[
                  { term: "Email", description: user.email },
                  { term: "Email Verified", description: user.emailVerified ? "Yes" : "No" },
                  { term: "MFA Enabled", description: user.mfaEnabled ? "Yes" : "No" },
                  { term: "Login Count", description: String(user.loginCount) },
                  { term: "Last Login", description: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never" },
                  { term: "Created", description: new Date(user.createdAt).toLocaleDateString() },
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete User?"
        primaryAction={{ content: "Delete", destructive: true, onAction: handleDelete }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteModalOpen(false) }]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to delete <strong>{user.email}</strong>? This will remove all their data and SSO connections.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
