import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";

/**
 * App Proxy Route - Forwards requests from storefront to backend
 *
 * Shopify app proxy forwards requests from /apps/sso/* to this route.
 * This route proxies all requests to the backend at /apps/sso/*.
 */

// Backend API URL
const BACKEND_URL = process.env.IDP_BACKEND_URL || "http://localhost:3000";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const path = params["*"] || "";

  // Special handling for /config endpoint - always return JSON
  if (path === "config" || path === "") {
    try {
      // Build backend URL with query params
      const backendUrl = new URL(`/apps/sso/${path}`, BACKEND_URL);
      url.searchParams.forEach((value, key) => {
        backendUrl.searchParams.set(key, value);
      });

      const response = await fetch(backendUrl.toString(), {
        method: request.method,
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
          "X-Shop-Domain": url.searchParams.get("shop") || "",
          "User-Agent": request.headers.get("user-agent") || "",
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(5000),
      });

      // Only accept JSON responses for config endpoint
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json") && response.ok) {
        const data = await response.json();
        return json(data, {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }

      // If backend returned non-JSON, log and return default
      console.warn(`[App Proxy] Backend returned non-JSON for /config: ${contentType}, status: ${response.status}`);
      throw new Error("Backend returned non-JSON response");
    } catch (error) {
      console.error("[App Proxy] Error fetching config from backend:", error);
      
      // Return default config that won't show buttons (safer than showing broken state)
      return json({
        enableSso: false,
        providers: [],
        ssoText: "Sign in with SSO",
        enableGoogle: false,
        enableMicrosoft: false,
        buttonColor: "#000000",
      }, {
        status: 200, // Return 200 so extension doesn't think it failed
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }
  }

  // For non-config endpoints, use original logic
  const backendUrl = new URL(`/apps/sso/${path}`, BACKEND_URL);
  url.searchParams.forEach((value, key) => {
    backendUrl.searchParams.set(key, value);
  });

  try {
    const response = await fetch(backendUrl.toString(), {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
        "X-Shop-Domain": url.searchParams.get("shop") || "",
        "User-Agent": request.headers.get("user-agent") || "",
      },
    });

    // If backend returns a redirect, follow it
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        return redirect(location);
      }
    }

    // For JSON responses
    if (response.headers.get("content-type")?.includes("application/json")) {
      const data = await response.json();
      return json(data, {
        status: response.status,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
        },
      });
    }

    // For other responses (HTML, etc.)
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[App Proxy] Proxy error:", error);
    return json({ error: "Backend service unavailable" }, {
      status: 503,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
};

// Handle POST requests (for SAML callbacks, etc.)
export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
      },
    });
  }

  const url = new URL(request.url);
  const path = params["*"] || "";

  // Build backend URL
  const backendUrl = new URL(`/apps/sso/${path}`, BACKEND_URL);
  url.searchParams.forEach((value, key) => {
    backendUrl.searchParams.set(key, value);
  });

  try {
    const body = await request.text();

    const response = await fetch(backendUrl.toString(), {
      method: request.method,
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
        "User-Agent": request.headers.get("user-agent") || "",
      },
      body: body || undefined,
    });

    // If backend returns a redirect, follow it
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        return redirect(location);
      }
    }

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Proxy action error:", error);
    return json({ error: "Backend service unavailable" }, { status: 503 });
  }
};
