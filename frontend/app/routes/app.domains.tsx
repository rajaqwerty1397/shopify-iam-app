import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
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
  IndexTable,
  useIndexResourceState,
  EmptyState,
  Modal,
  TextField,
  FormLayout,
  Banner,
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
    const [domains, organizations] = await Promise.all([
      apiService.getDomains(),
      apiService.getOrganizations().catch(() => []),
    ]);
    return json({ domains, organizations });
  } catch (error) {
    console.error('Domains loader error:', error);
    return json({ domains: [], organizations: [] });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const action = formData.get("action");

  const apiService = createApiService(shopDomain);

  try {
    switch (action) {
      case "add": {
        const data = {
          domain: (formData.get("domain") as string).toLowerCase().trim(),
          organizationId: formData.get("organizationId") as string || undefined,
          autoAssignOrg: formData.get("autoAssignOrg") === "true",
          enforceSso: formData.get("enforceSso") === "true",
        };
        await apiService.createDomain(data);
        return json({ success: true, message: "Domain added" });
      }

      case "verify": {
        const domainId = formData.get("domainId") as string;
        const result = await apiService.verifyDomain(domainId);
        return json({ success: result.success, message: result.message });
      }

      case "delete": {
        const domainIds = formData.getAll("domainIds") as string[];
        for (const id of domainIds) {
          await apiService.deleteDomain(id);
        }
        return json({ success: true, message: "Domains deleted" });
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    return json({ error: error.message || "Action failed" }, { status: 500 });
  }
};

export default function Domains() {
  const { domains, organizations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<typeof domains[0] | null>(null);
  const [newDomain, setNewDomain] = useState({
    domain: "",
    organizationId: "",
    autoAssignOrg: true,
    enforceSso: false,
  });

  const resourceName = {
    singular: "domain",
    plural: "domains",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(domains);

  const handleAddDomain = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "add");
    formData.append("domain", newDomain.domain);
    formData.append("organizationId", newDomain.organizationId);
    formData.append("autoAssignOrg", String(newDomain.autoAssignOrg));
    formData.append("enforceSso", String(newDomain.enforceSso));
    submit(formData, { method: "post" });
    setAddModalOpen(false);
    setNewDomain({ domain: "", organizationId: "", autoAssignOrg: true, enforceSso: false });
  }, [newDomain, submit]);

  const handleVerifyClick = useCallback((domain: typeof domains[0]) => {
    setSelectedDomain(domain);
    setVerifyModalOpen(true);
  }, []);

  const handleVerify = useCallback(() => {
    if (!selectedDomain) return;
    const formData = new FormData();
    formData.append("action", "verify");
    formData.append("domainId", selectedDomain.id);
    submit(formData, { method: "post" });
    setVerifyModalOpen(false);
  }, [selectedDomain, submit]);

  const handleDeleteConfirm = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "delete");
    selectedResources.forEach((id) => formData.append("domainIds", id));
    submit(formData, { method: "post" });
    setDeleteModalOpen(false);
    clearSelection();
  }, [selectedResources, submit, clearSelection]);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { tone: "success" | "warning" | "critical" }> = {
      verified: { tone: "success" },
      pending: { tone: "warning" },
      failed: { tone: "critical" },
    };
    return <Badge tone={config[status]?.tone || "warning"}>{status}</Badge>;
  };

  const rowMarkup = domains.map((domain, index) => (
    <IndexTable.Row
      id={domain.id}
      key={domain.id}
      selected={selectedResources.includes(domain.id)}
      position={index}
    >
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {domain.domain}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{getStatusBadge(domain.status)}</IndexTable.Cell>
      <IndexTable.Cell>
        {domain.organization ? (
          <Text as="span">{domain.organization.name}</Text>
        ) : (
          <Text as="span" tone="subdued">—</Text>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          {domain.autoAssignOrg && <Badge>Auto-assign</Badge>}
          {domain.enforceSso && <Badge tone="info">SSO enforced</Badge>}
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {domain.status === "pending" ? (
          <Button size="slim" onClick={() => handleVerifyClick(domain)}>
            Verify
          </Button>
        ) : (
          <Text as="span" variant="bodySm" tone="subdued">
            {domain.verifiedAt ? new Date(domain.verifiedAt).toLocaleDateString() : "—"}
          </Text>
        )}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const emptyStateMarkup = (
    <EmptyState
      heading="Verify your first domain"
      action={{ content: "Add Domain", onAction: () => setAddModalOpen(true) }}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>
        Verify email domains to automatically assign users to organizations and enforce SSO.
      </p>
    </EmptyState>
  );

  return (
    <Page
      title="Verified Domains"
      primaryAction={{ content: "Add Domain", onAction: () => setAddModalOpen(true) }}
      backAction={{ content: "Dashboard", url: "/app" }}
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
          <Card padding="0">
            {domains.length === 0 ? (
              emptyStateMarkup
            ) : (
              <IndexTable
                resourceName={resourceName}
                itemCount={domains.length}
                selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: "Domain" },
                  { title: "Status" },
                  { title: "Organization" },
                  { title: "Settings" },
                  { title: "Actions" },
                ]}
                bulkActions={[
                  { content: "Delete", onAction: () => setDeleteModalOpen(true), destructive: true },
                ]}
                loading={isLoading}
              >
                {rowMarkup}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      {/* Add Domain Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Domain"
        primaryAction={{
          content: "Add Domain",
          onAction: handleAddDomain,
          disabled: !newDomain.domain,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setAddModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Domain"
              value={newDomain.domain}
              onChange={(value) => setNewDomain((prev) => ({ ...prev, domain: value }))}
              autoComplete="off"
              placeholder="acme.com"
              helpText="Enter the domain without http:// or www"
            />
            <Select
              label="Assign to Organization"
              options={[
                { label: "None", value: "" },
                ...organizations.map((org) => ({ label: org.name, value: org.id })),
              ]}
              value={newDomain.organizationId}
              onChange={(value) => setNewDomain((prev) => ({ ...prev, organizationId: value }))}
              helpText="Users with this email domain will be added to this organization"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Verify Domain Modal */}
      <Modal
        open={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        title="Verify Domain"
        primaryAction={{
          content: "Verify Now",
          onAction: handleVerify,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setVerifyModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">
              Add the following TXT record to your DNS settings:
            </Text>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="medium">
                  Type: TXT
                </Text>
                <Text as="p" variant="bodySm" fontWeight="medium">
                  Host: @
                </Text>
                <Text as="p" variant="bodySm" fontWeight="medium">
                  Value:
                </Text>
                <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    {selectedDomain?.verificationToken}
                  </Text>
                </Box>
                <Button
                  size="slim"
                  onClick={() =>
                    navigator.clipboard.writeText(selectedDomain?.verificationToken || "")
                  }
                >
                  Copy
                </Button>
              </BlockStack>
            </Card>
            <Text as="p" variant="bodySm" tone="subdued">
              DNS changes may take up to 48 hours to propagate.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete domains?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDeleteConfirm,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setDeleteModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to delete {selectedResources.length} domain
            {selectedResources.length > 1 ? "s" : ""}?
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
