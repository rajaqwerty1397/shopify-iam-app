import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  DropZone,
  Banner,
  Badge,
  InlineStack,
  Box,
  TextField,
  FormLayout,
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

  const action = formData.get("_action") as string;

  if (action === "import_csv") {
    const csvData = formData.get("csvData") as string;
    const organizationId = formData.get("organizationId") as string;

    try {
      const result = await apiService.importUsersFromCSV({
        csvData,
        organizationId: organizationId || undefined,
      });
      return json({ success: true, created: result.created, skipped: result.skipped });
    } catch (error: any) {
      return json({ error: error.message || "Failed to import users" }, { status: 400 });
    }
  }

  if (action === "create_single") {
    const email = formData.get("email") as string;
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    const organizationId = formData.get("organizationId") as string;

    if (!email) {
      return json({ error: "Email is required" }, { status: 400 });
    }

    try {
      await apiService.createUser({
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        organizationId: organizationId || undefined,
        status: "pending",
      });
      return json({ success: true, message: `User ${email} created successfully` });
    } catch (error: any) {
      return json({ error: error.message || "Failed to create user" }, { status: 400 });
    }
  }

  return json({ error: "Invalid action" }, { status: 400 });
};

export default function ImportUsers() {
  const { organizations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [csvContent, setCsvContent] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("");
  const [singleUser, setSingleUser] = useState({ email: "", firstName: "", lastName: "" });

  const handleFileDrop = useCallback((_dropFiles: File[], acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        setCsvContent(e.target?.result as string);
      };
      reader.readAsText(file);
    }
  }, []);

  const handleImportCSV = () => {
    if (!csvContent) return;

    const formData = new FormData();
    formData.append("_action", "import_csv");
    formData.append("csvData", csvContent);
    formData.append("organizationId", selectedOrg);
    submit(formData, { method: "post" });
  };

  const handleCreateSingle = () => {
    const formData = new FormData();
    formData.append("_action", "create_single");
    formData.append("email", singleUser.email);
    formData.append("firstName", singleUser.firstName);
    formData.append("lastName", singleUser.lastName);
    formData.append("organizationId", selectedOrg);
    submit(formData, { method: "post" });
  };

  const orgOptions = [
    { label: "No Organization", value: "" },
    ...organizations.map((org) => ({ label: org.name, value: org.id })),
  ];

  return (
    <Page
      title="Import Users"
      backAction={{ content: "Users", url: "/app/users" }}
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical">{actionData.error}</Banner>
          </Layout.Section>
        )}

        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success">
              {actionData.message || `Imported ${actionData.created} users, skipped ${actionData.skipped} duplicates`}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Create Single User
              </Text>
              <FormLayout>
                <TextField
                  label="Email"
                  type="email"
                  value={singleUser.email}
                  onChange={(value) => setSingleUser({ ...singleUser, email: value })}
                  autoComplete="off"
                />
                <InlineStack gap="400">
                  <Box minWidth="200px">
                    <TextField
                      label="First Name"
                      value={singleUser.firstName}
                      onChange={(value) => setSingleUser({ ...singleUser, firstName: value })}
                      autoComplete="off"
                    />
                  </Box>
                  <Box minWidth="200px">
                    <TextField
                      label="Last Name"
                      value={singleUser.lastName}
                      onChange={(value) => setSingleUser({ ...singleUser, lastName: value })}
                      autoComplete="off"
                    />
                  </Box>
                </InlineStack>
                <Select
                  label="Organization (Optional)"
                  options={orgOptions}
                  value={selectedOrg}
                  onChange={setSelectedOrg}
                />
                <Button
                  variant="primary"
                  onClick={handleCreateSingle}
                  loading={isSubmitting}
                  disabled={!singleUser.email}
                >
                  Create User
                </Button>
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Bulk Import from CSV
              </Text>

              <Banner tone="info">
                <p>CSV file should have columns: email (required), firstName, lastName</p>
                <p>Example: email,firstName,lastName</p>
              </Banner>

              <DropZone onDrop={handleFileDrop} accept=".csv">
                <DropZone.FileUpload actionHint="or drop CSV file to upload" />
              </DropZone>

              {csvContent && (
                <BlockStack gap="200">
                  <Badge tone="success">File loaded</Badge>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {csvContent.split("\n").length - 1} rows detected
                  </Text>
                </BlockStack>
              )}

              <Select
                label="Assign to Organization (Optional)"
                options={orgOptions}
                value={selectedOrg}
                onChange={setSelectedOrg}
              />

              <Button
                variant="primary"
                onClick={handleImportCSV}
                loading={isSubmitting}
                disabled={!csvContent}
              >
                Import Users
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Sample CSV Format
              </Text>
              <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                <pre style={{ margin: 0, fontSize: "12px", fontFamily: "monospace" }}>
{`email,firstName,lastName
john@acme.com,John,Doe
jane@acme.com,Jane,Smith
bob@acme.com,Bob,Wilson`}
                </pre>
              </Box>
              <Button
                onClick={() => {
                  const csv = "email,firstName,lastName\njohn@example.com,John,Doe\njane@example.com,Jane,Smith";
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "users_template.csv";
                  a.click();
                }}
              >
                Download Template
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
