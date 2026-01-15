import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
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
  IndexTable,
  useIndexResourceState,
  EmptyState,
  Modal,
  Avatar,
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
    console.error('Organizations loader error:', error);
    return json({ organizations: [] });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const action = formData.get("action");
  const orgIds = formData.getAll("orgIds") as string[];

  const apiService = createApiService(shopDomain);

  try {
    if (action === "delete") {
      for (const id of orgIds) {
        await apiService.deleteOrganization(id);
      }
      return json({ success: true, message: "Organizations deleted" });
    }
    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error('Organizations action error:', error);
    return json({ error: "Action failed" }, { status: 500 });
  }
};

export default function Organizations() {
  const { organizations } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const resourceName = { singular: "organization", plural: "organizations" };

  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(organizations);

  const handleDeleteClick = useCallback(() => {
    setDeleteModalOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "delete");
    selectedResources.forEach((id) => formData.append("orgIds", id));
    submit(formData, { method: "post" });
    setDeleteModalOpen(false);
    clearSelection();
  }, [selectedResources, submit, clearSelection]);

  const bulkActions = [
    { content: "Delete", onAction: handleDeleteClick, destructive: true },
  ];

  const rowMarkup = organizations.map((org: any, index: number) => (
    <IndexTable.Row
      id={org.id}
      key={org.id}
      selected={selectedResources.includes(org.id)}
      position={index}
    >
      <IndexTable.Cell>
        <InlineStack gap="300" blockAlign="center">
          <Avatar size="sm" name={org.name} source={org.logoUrl || undefined} />
          <BlockStack gap="100">
            <Text as="span" variant="bodyMd" fontWeight="semibold">{org.name}</Text>
            <Text as="span" variant="bodySm" tone="subdued">{org.slug}</Text>
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd">{org.userCount || 0}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={org.ssoRequired ? "success" : "new"}>
          {org.ssoRequired ? "Required" : "Optional"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" tone="subdued">
          {new Date(org.createdAt).toLocaleDateString()}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Button size="slim" url={`/app/organizations/${org.id}`}>Manage</Button>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const emptyStateMarkup = (
    <EmptyState
      heading="Create your first organization"
      action={{ content: "Create Organization", url: "/app/organizations/new" }}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>Organizations help you group users and manage SSO settings for B2B customers.</p>
    </EmptyState>
  );

  return (
    <Page
      title="Organizations"
      primaryAction={{ content: "Create Organization", url: "/app/organizations/new" }}
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {organizations.length === 0 ? emptyStateMarkup : (
              <IndexTable
                resourceName={resourceName}
                itemCount={organizations.length}
                selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: "Organization" },
                  { title: "Members" },
                  { title: "SSO" },
                  { title: "Created" },
                  { title: "Actions" },
                ]}
                bulkActions={bulkActions}
                loading={isLoading}
              >
                {rowMarkup}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete organizations?"
        primaryAction={{ content: "Delete", destructive: true, onAction: handleDeleteConfirm }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">
              Are you sure you want to delete {selectedResources.length} organization{selectedResources.length > 1 ? "s" : ""}?
            </Text>
            <Text as="p" tone="critical">Users will be unassigned but not deleted.</Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
