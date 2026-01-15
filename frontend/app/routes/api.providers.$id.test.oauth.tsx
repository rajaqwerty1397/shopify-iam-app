import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

const BACKEND_URL = process.env.IDP_BACKEND_URL || "http://localhost:3000";

/**
 * OAuth Test Route - Redirects to backend OAuth test endpoint
 * This route handles GET requests to /api/providers/{id}/test/oauth
 */
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const providerId = params.id;

  // Redirect directly to backend OAuth test endpoint
  // The backend will handle the OAuth flow and redirect appropriately
  return redirect(`${BACKEND_URL}/api/providers/${providerId}/test/oauth`);
};
