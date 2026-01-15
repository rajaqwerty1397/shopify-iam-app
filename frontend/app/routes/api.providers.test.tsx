import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const BACKEND_URL = process.env.IDP_BACKEND_URL || "http://localhost:3000";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/providers/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shop-Domain": shopDomain,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    return json(result, { status: response.status });
  } catch (error) {
    console.error("Test connection error:", error);
    return json({
      success: false,
      message: `Failed to test connection: ${error instanceof Error ? error.message : "Unknown error"}`,
      error: String(error),
    }, { status: 500 });
  }
};
