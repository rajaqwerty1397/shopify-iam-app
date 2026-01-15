import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Box,
  InlineStack,
  Badge,
  IndexTable,
  Filters,
  ChoiceList,
  Pagination,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

const PAGE_SIZE = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const actionFilter = url.searchParams.get("action") || "";

  const apiService = createApiService(shopDomain);

  try {
    const result = await apiService.getAuditLogs({
      action: actionFilter || undefined,
      page,
      limit: PAGE_SIZE,
    });

    return json({
      logs: result.logs,
      totalCount: result.total,
      page: result.page,
      totalPages: Math.ceil(result.total / PAGE_SIZE),
      actionTypes: result.actionTypes || [],
    });
  } catch (error) {
    console.error('Audit logs loader error:', error);
    return json({
      logs: [],
      totalCount: 0,
      page: 1,
      totalPages: 0,
      actionTypes: [],
    });
  }
};

export default function AuditLogs() {
  const { logs, totalCount, page, totalPages, actionTypes } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [actionFilter, setActionFilter] = useState<string[]>(
    searchParams.get("action") ? [searchParams.get("action")!] : []
  );

  const handleActionFilterChange = useCallback(
    (value: string[]) => {
      setActionFilter(value);
      const params = new URLSearchParams(searchParams);
      if (value.length > 0) {
        params.set("action", value[0]);
      } else {
        params.delete("action");
      }
      params.set("page", "1");
      setSearchParams(params);
    },
    [searchParams, setSearchParams]
  );

  const handleClearAll = useCallback(() => {
    setActionFilter([]);
    setSearchParams({ page: "1" });
  }, [setSearchParams]);

  const handlePagination = useCallback(
    (direction: "next" | "previous") => {
      const params = new URLSearchParams(searchParams);
      const newPage = direction === "next" ? page + 1 : page - 1;
      params.set("page", String(newPage));
      setSearchParams(params);
    },
    [page, searchParams, setSearchParams]
  );

  const getActionBadge = (action: string) => {
    const category = action.split(".")[0];
    const tones: Record<string, "success" | "info" | "warning" | "critical" | "attention"> = {
      user: "info",
      sso_provider: "success",
      organization: "attention",
      domain: "warning",
      settings: "info",
      scim: "success",
    };
    return <Badge tone={tones[category] || "info"}>{action}</Badge>;
  };

  const rowMarkup = logs.map((log: any, index: number) => (
    <IndexTable.Row id={log.id} key={log.id} position={index}>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" tone="subdued">
          {new Date(log.createdAt).toLocaleString()}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{getActionBadge(log.action)}</IndexTable.Cell>
      <IndexTable.Cell>
        {log.user ? (
          <Text as="span" variant="bodyMd">
            {log.user.firstName || log.user.lastName
              ? `${log.user.firstName || ""} ${log.user.lastName || ""}`.trim()
              : log.user.email}
          </Text>
        ) : (
          <Text as="span" tone="subdued">System</Text>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd">
          {log.description || log.resource}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" tone="subdued">
          {log.ipAddress || "—"}
        </Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page title="Audit Logs" backAction={{ content: "Dashboard", url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Box padding="400">
              <Filters
                queryValue=""
                filters={[
                  {
                    key: "action",
                    label: "Action",
                    filter: (
                      <ChoiceList
                        title="Action"
                        titleHidden
                        choices={actionTypes.map((a: string) => ({ label: a, value: a }))}
                        selected={actionFilter}
                        onChange={handleActionFilterChange}
                      />
                    ),
                    shortcut: true,
                  },
                ]}
                onQueryChange={() => {}}
                onQueryClear={() => {}}
                onClearAll={handleClearAll}
              />
            </Box>
            <IndexTable
              resourceName={{ singular: "log", plural: "logs" }}
              itemCount={logs.length}
              headings={[
                { title: "Time" },
                { title: "Action" },
                { title: "User" },
                { title: "Description" },
                { title: "IP Address" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
            {totalPages > 1 && (
              <Box padding="400">
                <InlineStack align="center" gap="400">
                  <Pagination
                    hasPrevious={page > 1}
                    hasNext={page < totalPages}
                    onPrevious={() => handlePagination("previous")}
                    onNext={() => handlePagination("next")}
                  />
                  <Text as="span" variant="bodySm" tone="subdued">
                    Page {page} of {totalPages} ({totalCount} logs)
                  </Text>
                </InlineStack>
              </Box>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
