import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  let type = url.searchParams.get("type") || "unknown";
  const providerId = params.id || url.searchParams.get("providerId");

  // Try to get provider type from backend API
  if (providerId) {
    try {
      const backendUrl = process.env.IDP_BACKEND_URL || 'http://localhost:3000';
      const shopDomain = request.headers.get('X-Shop-Domain') || 'unknown';

      const response = await fetch(`${backendUrl}/api/providers/${providerId}`, {
        headers: {
          'X-Shop-Domain': shopDomain,
        },
      });

      if (response.ok) {
        const provider = await response.json();
        if (provider?.type) {
          type = provider.type;
        }
      }
    } catch (e) {
      // Ignore API errors, use default type
    }
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>SSO Test - ${type.toUpperCase()}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 600px;
          margin: 50px auto;
          padding: 20px;
          background: #f6f6f7;
        }
        .card {
          background: white;
          border-radius: 12px;
          padding: 30px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        h1 { color: #202223; margin-top: 0; }
        .success { color: #007f5f; background: #e3fcef; padding: 15px; border-radius: 8px; }
        .warning { color: #b98900; background: #fff8e6; padding: 15px; border-radius: 8px; }
        .info { color: #0066cc; background: #e6f2ff; padding: 15px; border-radius: 8px; margin-top: 20px; }
        code { background: #f1f1f1; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
        .btn {
          display: inline-block;
          padding: 12px 24px;
          background: #008060;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          margin-top: 20px;
          border: none;
          cursor: pointer;
          font-size: 14px;
        }
        .btn:hover { background: #006e52; }
        ul { padding-left: 20px; }
        li { margin: 8px 0; }
        .provider-id { font-size: 11px; color: #666; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>SSO Test - ${type.toUpperCase()}</h1>
        ${providerId ? `<p class="provider-id">Provider ID: <code>${providerId}</code></p>` : ''}

        <div class="warning">
          <strong>Backend Not Connected</strong>
          <p>The SSO test requires the IDP backend service to be running.</p>
        </div>

        <div class="info">
          <strong>What this test would do:</strong>
          <ul>
            ${type === 'oidc' ? `
              <li>Redirect to your OIDC provider's authorization endpoint</li>
              <li>User authenticates with their credentials</li>
              <li>Provider redirects back with authorization code</li>
              <li>Backend exchanges code for tokens</li>
              <li>User info is retrieved and session created</li>
            ` : ''}
            ${type === 'saml' ? `
              <li>Generate SAML AuthnRequest</li>
              <li>Redirect to IDP's SSO URL</li>
              <li>User authenticates at IDP</li>
              <li>IDP sends SAML Response to ACS URL</li>
              <li>Backend validates assertion and creates session</li>
            ` : ''}
            ${['oauth', 'google', 'microsoft', 'github', 'facebook'].includes(type) ? `
              <li>Redirect to OAuth provider</li>
              <li>User grants permission</li>
              <li>Provider redirects with auth code</li>
              <li>Backend exchanges for access token</li>
              <li>User profile retrieved and session created</li>
            ` : ''}
            ${type === 'unknown' ? `
              <li>Provider type not specified</li>
              <li>Would redirect to configured identity provider</li>
              <li>User authenticates</li>
              <li>Session created on success</li>
            ` : ''}
          </ul>
        </div>

        <h3>Next Steps to Enable SSO</h3>
        <ol>
          <li>Deploy the IDP backend service</li>
          <li>Configure the backend with your provider credentials</li>
          <li>Set up the customer login portal</li>
          <li>Add the SSO button to your store's login page</li>
        </ol>

        <button class="btn" onclick="window.close()">Close Window</button>
      </div>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
    },
  });
};
