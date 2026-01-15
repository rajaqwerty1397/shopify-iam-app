import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  
  // Preserve all query params (shop, host, etc.) when redirecting
  const searchParams = url.search;
  
  // Always redirect to /app - Shopify auth will handle the rest
  return redirect(`/app${searchParams}`);
};
