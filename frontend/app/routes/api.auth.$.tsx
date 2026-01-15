import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

const BACKEND_URL = process.env.IDP_BACKEND_URL || "http://localhost:3000";

/**
 * Auth API Proxy Route
 * Proxies all /api/auth/* requests to the backend
 * This handles OAuth callbacks from Google, Auth0, Microsoft, etc.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const path = params["*"] || "";
  
  // Build backend URL with all query params
  const backendUrl = new URL(`/api/auth/${path}`, BACKEND_URL);
  url.searchParams.forEach((value, key) => {
    backendUrl.searchParams.set(key, value);
  });

  try {
    const response = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
        "X-Forwarded-Host": url.host,
        "User-Agent": request.headers.get("user-agent") || "",
        "Cookie": request.headers.get("cookie") || "",
      },
      redirect: "manual",
    });

    // Handle redirects - forward them to the client
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        return redirect(location, {
          headers: {
            "Set-Cookie": response.headers.get("set-cookie") || "",
          },
        });
      }
    }

    // For HTML responses (success/error pages)
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const html = await response.text();
      return new Response(html, {
        status: response.status,
        headers: {
          "Content-Type": "text/html",
          "Set-Cookie": response.headers.get("set-cookie") || "",
        },
      });
    }

    // For JSON responses
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": response.headers.get("set-cookie") || "",
        },
      });
    }

    // Default: return as-is
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": contentType || "text/plain",
        "Set-Cookie": response.headers.get("set-cookie") || "",
      },
    });
  } catch (error) {
    return new Response(
      `<html><body><h1>Authentication Error</h1><p>Service temporarily unavailable</p></body></html>`,
      {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }
    );
  }
};

// Handle POST requests (for token exchange, etc.)
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const path = params["*"] || "";

  // Build backend URL
  const backendUrl = new URL(`/api/auth/${path}`, BACKEND_URL);
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
        "X-Forwarded-Host": url.host,
        "User-Agent": request.headers.get("user-agent") || "",
        "Cookie": request.headers.get("cookie") || "",
      },
      body: body || undefined,
      redirect: "manual",
    });

    // Handle redirects
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        return redirect(location, {
          headers: {
            "Set-Cookie": response.headers.get("set-cookie") || "",
          },
        });
      }
    }

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "text/plain",
        "Set-Cookie": response.headers.get("set-cookie") || "",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Authentication service unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
};
