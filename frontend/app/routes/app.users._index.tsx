import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useSearchParams, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  EmptyState,
  ResourceList,
  ResourceItem,
  Avatar,
  Filters,
  ChoiceList,
  Modal,
  TextField,
  Pagination,
  Banner,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const page = parseInt(url.searchParams.get("page") || "1");

  // Create API service with shop domain
  const apiService = createApiService(shopDomain);

  try {
    // Fetch users from backend API
    const result = await apiService.getUsers({ search, status, page, limit: 10 });

    return json({
      shopDomain,
      users: result.users,
      total: result.total,
      page: result.page,
      search,
      statusFilter: status,
    });
  } catch (error) {
    console.error('Users loader error:', error);
    return json({
      shopDomain,
      users: [],
      total: 0,
      page: 1,
      search,
      statusFilter: status,
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const action = formData.get("action");

  // Create API service with shop domain
  const apiService = createApiService(shopDomain);

  try {
    if (action === "delete") {
      const userId = formData.get("userId") as string;
      if (userId) {
        await apiService.deleteUser(userId);
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error('Users action error:', error);
    return json({ success: false, error: 'Action failed' }, { status: 500 });
  }
};

export default function Users() {
  const data = useLoaderData<typeof loader>();
  const users = data?.users || [];
  const total = data?.total || 0;
  const page = data?.page || 1;
  const search = data?.search || "";
  const statusFilter = data?.statusFilter || "";
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();

  const [queryValue, setQueryValue] = useState(search);
  const [selectedStatus, setSelectedStatus] = useState<string[]>(
    statusFilter ? [statusFilter] : []
  );
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);

  const handleQueryChange = useCallback((value: string) => {
    setQueryValue(value);
  }, []);

  const handleQueryClear = useCallback(() => {
    setQueryValue("");
    const params = new URLSearchParams(searchParams);
    params.delete("search");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleStatusChange = useCallback((value: string[]) => {
    setSelectedStatus(value);
    const params = new URLSearchParams(searchParams);
    if (value.length > 0) {
      params.set("status", value[0]);
    } else {
      params.delete("status");
    }
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleClearFilters = useCallback(() => {
    setSelectedStatus([]);
    setQueryValue("");
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (queryValue) {
      params.set("search", queryValue);
    } else {
      params.delete("search");
    }
    setSearchParams(params);
  }, [queryValue, searchParams, setSearchParams]);

  const handleDeleteClick = useCallback((user: any) => {
    setUserToDelete(user);
    setDeleteModalOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (userToDelete) {
      const formData = new FormData();
      formData.append("action", "delete");
      formData.append("userId", userToDelete.id);
      submit(formData, { method: "post" });
    }
    setDeleteModalOpen(false);
    setUserToDelete(null);
  }, [userToDelete, submit]);

  const getStatusBadge = (status: string) => {
    const tones: Record<string, "success" | "warning" | "attention"> = {
      active: "success",
      pending: "attention",
      inactive: "warning",
    };
    return <Badge tone={tones[status]}>{status}</Badge>;
  };

  const filters = [
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={[
            { label: "Active", value: "active" },
            { label: "Pending", value: "pending" },
            { label: "Inactive", value: "inactive" },
          ]}
          selected={selectedStatus}
          onChange={handleStatusChange}
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = selectedStatus.length > 0
    ? [{
        key: "status",
        label: `Status: ${selectedStatus.join(", ")}`,
        onRemove: () => handleStatusChange([]),
      }]
    : [];

  const totalPages = Math.ceil(total / 10);

  return (
    <Page
      title="Users"
      primaryAction={{
        content: "Add User",
        url: "/app/users/new",
      }}
      secondaryActions={[
        {
          content: "Import Users",
          url: "/app/users/import",
        },
      ]}
    >
      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete User?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDeleteConfirm,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to delete {userToDelete?.email}? This action cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>

      <Layout>
        <Layout.Section>
          {users.length === 0 && !search && !statusFilter ? (
            <Card>
              <EmptyState
                heading="Add your first user"
                action={{
                  content: "Add User",
                  url: "/app/users/new",
                }}
                secondaryAction={{
                  content: "Import Users",
                  url: "/app/users/import",
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Add users who can sign in via SSO. You can add them manually or import from a CSV file.
                </p>
              </EmptyState>
            </Card>
          ) : (
            <Card padding="0">
              <ResourceList
                resourceName={{ singular: "user", plural: "users" }}
                items={users}
                filterControl={
                  <Filters
                    queryValue={queryValue}
                    queryPlaceholder="Search by name or email"
                    filters={filters}
                    appliedFilters={appliedFilters}
                    onQueryChange={handleQueryChange}
                    onQueryClear={handleQueryClear}
                    onClearAll={handleClearFilters}
                  />
                }
                renderItem={(item: any) => {
                  const { id, email, firstName, lastName, status, ssoProvider, lastLogin, loginCount } = item;
                  const name = `${firstName || ''} ${lastName || ''}`.trim() || email;

                  return (
                    <ResourceItem
                      id={id}
                      url={`/app/users/${id}`}
                      accessibilityLabel={`View details for ${name}`}
                      media={
                        <Avatar
                          customer
                          size="md"
                          name={name}
                        />
                      }
                      shortcutActions={[
                        {
                          content: 'View',
                          url: `/app/users/${id}`,
                        },
                        {
                          content: 'Delete',
                          destructive: true,
                          onAction: () => handleDeleteClick(item),
                        },
                      ]}
                    >
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" variant="bodyMd" fontWeight="bold">
                            {name}
                          </Text>
                          {getStatusBadge(status)}
                        </InlineStack>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {email}
                        </Text>
                        <InlineStack gap="400">
                          {ssoProvider && (
                            <Text as="span" variant="bodySm" tone="subdued">
                              SSO: {ssoProvider}
                            </Text>
                          )}
                          <Text as="span" variant="bodySm" tone="subdued">
                            {loginCount} logins
                          </Text>
                          {lastLogin && (
                            <Text as="span" variant="bodySm" tone="subdued">
                              Last: {new Date(lastLogin).toLocaleDateString()}
                            </Text>
                          )}
                        </InlineStack>
                      </BlockStack>
                    </ResourceItem>
                  );
                }}
              />

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
                  <Pagination
                    hasPrevious={page > 1}
                    hasNext={page < totalPages}
                    onPrevious={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set("page", String(page - 1));
                      setSearchParams(params);
                    }}
                    onNext={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set("page", String(page + 1));
                      setSearchParams(params);
                    }}
                  />
                </div>
              )}
            </Card>
          )}
        </Layout.Section>

        {/* Stats Sidebar */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                User Statistics
              </Text>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="span">Total Users</Text>
                  <Text as="span" fontWeight="bold">{total}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span">Active</Text>
                  <Badge tone="success">
                    {users.filter((u: any) => u.status === 'active').length}
                  </Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span">Pending</Text>
                  <Badge tone="attention">
                    {users.filter((u: any) => u.status === 'pending').length}
                  </Badge>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>

          <div style={{ marginTop: '16px' }}>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Quick Actions
                </Text>
                <Button url="/app/users/import" fullWidth>
                  Import from CSV
                </Button>
                <Button url="/app/users/new" fullWidth variant="secondary">
                  Add Single User
                </Button>
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
