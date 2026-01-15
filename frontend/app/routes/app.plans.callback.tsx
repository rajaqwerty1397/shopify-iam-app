import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { createApiService } from "../lib/api.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");
  const chargeId = url.searchParams.get("charge_id");

  if (plan && chargeId) {
    // Notify backend about plan upgrade
    const apiService = createApiService(shopDomain);

    try {
      await apiService.upgradePlan(plan);
    } catch (error) {
      console.error('Failed to update plan in backend:', error);
    }
  }

  return redirect("/app/settings");
};
