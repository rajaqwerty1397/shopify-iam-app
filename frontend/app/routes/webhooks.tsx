import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Webhook handler for Shopify mandatory webhooks (GDPR compliance)
 *
 * All data is stored in the backend, so we log the webhook events
 * and let the backend handle actual data cleanup via its own webhook endpoint.
 *
 * Note: Configure Shopify to also send webhooks to the backend at:
 * {BACKEND_URL}/api/shopify/webhooks
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  // All webhook handling is done by the backend
  // Frontend just acknowledges receipt
  return new Response(null, { status: 200 });
};
