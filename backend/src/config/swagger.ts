import { FastifyDynamicSwaggerOptions } from '@fastify/swagger';
import { FastifySwaggerUiOptions } from '@fastify/swagger-ui';
import { config } from './index.js';

export const swaggerConfig: FastifyDynamicSwaggerOptions = {
  openapi: {
    info: {
      title: 'Persona SSO API',
      description: `
# Persona SSO API Documentation

Enterprise Single Sign-On solution for Shopify stores supporting OIDC and SAML 2.0.

## Features
- **OIDC Support**: Google, Microsoft, Facebook
- **SAML 2.0 Support**: Okta, Azure AD, OneLogin, Salesforce
- **Shopify Integration**: Multipass for Plus stores, password-based for non-Plus
- **Multi-tenant**: Support for multiple stores and providers

## Authentication
Most endpoints require authentication via:
- \`X-Shopify-Session-Token\`: For embedded app requests
- \`Authorization: Bearer <token>\`: For API access

## Error Names
| Error | Description |
|-------|-------------|
| invalid_credentials | Invalid credentials provided |
| session_expired | Session has expired |
| insufficient_permissions | User lacks required permissions |
| provider_not_configured | SSO provider not configured |
| provider_disabled | SSO provider is disabled |
| user_limit_exceeded | Store user limit exceeded |
| user_blocked | User account is blocked |
| validation_failed | Request validation failed |
| not_found | Resource not found |
| duplicate_resource | Resource already exists |
| internal_error | Internal server error |
      `,
      version: '1.0.0',
      contact: {
        name: 'Alintro Support',
        email: 'support@alintro.com',
        url: 'https://alintro.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: config.app.url,
        description: config.isDev ? 'Development Server' : 'Production Server',
      },
    ],
    tags: [
      { name: 'Health', description: 'Health check endpoints' },
      { name: 'Platforms', description: 'Platform management (Shopify, WooCommerce)' },
      { name: 'Applications', description: 'Application management (SSO, Reviews)' },
      { name: 'App Platforms', description: 'App-Platform relationship management' },
      { name: 'Stores', description: 'Store installation management' },
      { name: 'Plans', description: 'Subscription plan management' },
      { name: 'Subscriptions', description: 'Store subscription management' },
      { name: 'SSO Providers', description: 'Identity provider configuration' },
      { name: 'SSO Users', description: 'SSO user management' },
      { name: 'Login Events', description: 'Authentication audit log' },
      { name: 'Auth', description: 'Authentication flow endpoints' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for API access',
        },
        ShopifySession: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Shopify-Session-Token',
          description: 'Shopify session token for embedded apps',
        },
      },
    },
  },
};

export const swaggerUiConfig: FastifySwaggerUiOptions = {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    syntaxHighlight: {
      theme: 'monokai',
    },
  },
  staticCSP: false, // Disable CSP for Swagger UI to work with ngrok
};
