import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigate } from "@remix-run/react";
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
  IndexTable,
  useIndexResourceState,
  Modal,
  Box,
  Divider,
  ButtonGroup,
  Tooltip,
  Icon,
} from "@shopify/polaris";
import {
  KeyIcon,
  LockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback } from "react";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const apiService = createApiService(shopDomain);

  try {
    const providersData = await apiService.getProviders();

    const providers = providersData.map((p: any) => ({
      id: p.id,
      name: p.name || p.displayName,
      type: p.type || p.protocol,
      provider: p.provider || p.providerType,
      status: p.status || (p.isEnabled ? 'active' : 'inactive'),
      loginCount: p.loginCount || 0,
      lastUsed: p.lastUsed || p.updatedAt,
    }));

    return json({
      shopDomain,
      providers,
    });
  } catch (error) {
    console.error('SSO Providers loader error:', error);
    return json({
      shopDomain,
      providers: [],
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const action = formData.get("action");
  const providerId = formData.get("providerId") as string;

  const apiService = createApiService(shopDomain);

  try {
    if (action === "delete" && providerId) {
      await apiService.deleteProvider(providerId);
    } else if (action === "toggle" && providerId) {
      const enabled = formData.get("enabled") === "true";
      await apiService.toggleProviderStatus(providerId, enabled);
    }

    return json({ success: true });
  } catch (error) {
    console.error('SSO Providers action error:', error);
    return json({ success: false, error: 'Action failed' }, { status: 500 });
  }
};

function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    google: 'Google',
    azure_ad: 'Microsoft Entra ID',
    facebook: 'Facebook',
    salesforce: 'Salesforce',
    okta: 'Okta',
    custom: 'Custom Provider',
    saml: 'SAML',
    oidc: 'OIDC',
  };
  return names[provider] || provider;
}

export default function SSOProviders() {
  const { providers } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigate = useNavigate();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<any>(null);

  const resourceName = {
    singular: 'provider',
    plural: 'providers',
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(providers);

  const handleDeleteClick = useCallback((provider: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setProviderToDelete(provider);
    setDeleteModalOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (providerToDelete) {
      const formData = new FormData();
      formData.append("action", "delete");
      formData.append("providerId", providerToDelete.id);
      submit(formData, { method: "post" });
    }
    setDeleteModalOpen(false);
    setProviderToDelete(null);
  }, [providerToDelete, submit]);

  const handleToggleStatus = useCallback((provider: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const formData = new FormData();
    formData.append("action", "toggle");
    formData.append("providerId", provider.id);
    formData.append("enabled", provider.status === 'active' ? 'false' : 'true');
    submit(formData, { method: "post" });
  }, [submit]);

  const handleRowClick = useCallback((id: string) => {
    navigate(`/app/sso-providers/${id}`);
  }, [navigate]);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { tone: "success" | "warning" | "attention"; label: string }> = {
      active: { tone: "success", label: "Active" },
      inactive: { tone: "warning", label: "Inactive" },
      draft: { tone: "attention", label: "Draft" },
    };
    const { tone, label } = config[status] || { tone: "attention", label: status };
    return <Badge tone={tone}>{label}</Badge>;
  };

  const rowMarkup = providers.map((provider: any, index: number) => (
    <IndexTable.Row
      id={provider.id}
      key={provider.id}
      selected={selectedResources.includes(provider.id)}
      position={index}
      onClick={() => handleRowClick(provider.id)}
    >
      <IndexTable.Cell>
        <InlineStack gap="300" blockAlign="center">
          <Box>
            <Icon source={KeyIcon} tone="base" />
          </Box>
          <BlockStack gap="050">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {provider.name}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {getProviderDisplayName(provider.provider)} ({provider.type.toUpperCase()})
            </Text>
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {getStatusBadge(provider.status)}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm">{provider.loginCount}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" tone="subdued">
          {provider.lastUsed
            ? new Date(provider.lastUsed).toLocaleDateString()
            : 'Never'
          }
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div onClick={(e) => e.stopPropagation()}>
          <ButtonGroup>
            <Button
              size="slim"
              onClick={(e: any) => handleToggleStatus(provider, e)}
            >
              {provider.status === 'active' ? 'Disable' : 'Enable'}
            </Button>
            <Button
              size="slim"
              variant="secondary"
              onClick={(e: any) => {
                e.stopPropagation();
                navigate(`/app/sso-providers/${provider.id}`);
              }}
            >
              Edit
            </Button>
            <Button
              size="slim"
              variant="secondary"
              tone="critical"
              onClick={(e: any) => handleDeleteClick(provider, e)}
            >
              Delete
            </Button>
          </ButtonGroup>
        </div>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="SSO Providers"
      primaryAction={{
        content: "Add Provider",
        url: "/app/sso-providers/new",
      }}
    >
      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete SSO Provider?"
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
          <BlockStack gap="200">
            <Text as="p">
              Are you sure you want to delete <strong>{providerToDelete?.name}</strong>?
            </Text>
            <Text as="p" tone="subdued">
              Users will no longer be able to sign in using this provider.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Layout>
        <Layout.Section>
          {providers.length === 0 ? (
            <Card>
              <EmptyState
                heading="Configure your first SSO Provider"
                action={{
                  content: "Add SSO Provider",
                  url: "/app/sso-providers/new",
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Connect your Identity Provider to enable Single Sign-On for your customers.
                </p>
              </EmptyState>
            </Card>
          ) : (
            <Card padding="0">
              <IndexTable
                resourceName={resourceName}
                itemCount={providers.length}
                selectedItemsCount={
                  allResourcesSelected ? 'All' : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: 'Provider' },
                  { title: 'Status' },
                  { title: 'Logins' },
                  { title: 'Last Used' },
                  { title: 'Actions' },
                ]}
                selectable={false}
              >
                {rowMarkup}
              </IndexTable>
            </Card>
          )}
        </Layout.Section>

        {/* Help Sidebar */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Supported Providers</Text>
              <Divider />
              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">SAML 2.0</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Microsoft Entra ID, Okta, Salesforce, OneLogin
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">OAuth / OIDC</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Google, Microsoft, Custom OAuth providers
                  </Text>
                </BlockStack>
              </BlockStack>
              <Divider />
              <Button url="/app/sso-providers/new" fullWidth>
                Add New Provider
              </Button>
            </BlockStack>
          </Card>

          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Quick Tips</Text>
                <Divider />
                <Text as="p" variant="bodySm" tone="subdued">
                  Click on a provider row to edit its configuration.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Disable a provider to temporarily stop logins without deleting it.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Test your configuration before enabling in production.
                </Text>
              </BlockStack>
            </Card>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
