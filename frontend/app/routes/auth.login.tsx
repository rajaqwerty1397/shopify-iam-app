import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  if (shop) {
    throw await login(request);
  }
  
  // Return a simple page asking for shop - this shouldn't normally happen
  // when accessed via Shopify admin
  return json({ error: "Missing shop parameter" });
};

export default function AuthLogin() {
  return (
    <div style={{ padding: "40px", fontFamily: "system-ui", textAlign: "center" }}>
      <h1>IAM SSO Manager</h1>
      <p>Please access this app through your Shopify admin panel.</p>
      <p style={{ color: "#666", marginTop: "20px" }}>
        Go to your Shopify Admin → Apps → IAM SSO Manager
      </p>
    </div>
  );
}
