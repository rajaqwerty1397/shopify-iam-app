/**
 * API Service - All backend API calls
 * This file centralizes all API calls to the backend IDP service
 */

// API Base URL - configurable per environment
const API_BASE_URL = process.env.IDP_BACKEND_URL || 'http://localhost:3000';

// Types
export interface DashboardStats {
  ssoProviders: number;
  activeProviders: number;
  uniqueLogins: number; // Unique logged-in users count
  totalLogins: number;
}

export interface SSOProvider {
  id: string;
  name: string;
  type: 'saml' | 'oauth';
  provider: string; // azure_ad, google, facebook, salesforce, custom
  status: 'active' | 'inactive' | 'draft';
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  status: 'active' | 'pending' | 'inactive';
  ssoProvider?: string;
  lastLogin?: string;
  loginCount: number;
  createdAt: string;
}

export interface LoginActivity {
  id: string;
  email: string;
  provider: string;
  status: 'success' | 'failed';
  timestamp: string;
  ipAddress?: string;
}

export interface OnboardingStatus {
  hasProvider: boolean;
  hasUsers: boolean;
  hasEnabledAppEmbed: boolean;
  completedSteps: string[];
}

export interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId?: string;
  description?: string;
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  ipAddress?: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  ssoRequired: boolean;
  defaultRole: string;
  userCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface VerifiedDomain {
  id: string;
  domain: string;
  status: 'pending' | 'verified' | 'failed';
  verificationToken: string;
  verificationMethod: string;
  verifiedAt?: string;
  organizationId?: string;
  autoAssignOrg: boolean;
  enforceSso: boolean;
  createdAt: string;
}

export interface AIInsight {
  id: string;
  type: 'security' | 'optimization' | 'trend' | 'alert' | 'recommendation';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  metric?: string;
  action?: string;
  createdAt: string;
}

export interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  suspendedUsers: number;
  totalProviders: number;
  activeProviders: number;
  totalLogins: number;
  successfulLogins: number;
  failedLogins: number;
  loginsByProvider: { provider: string; count: number }[];
  loginsByDay: { date: string; success: number; failed: number }[];
  topUsers: { email: string; loginCount: number }[];
  organizations: number;
  domains: number;
  verifiedDomains: number;
  recentErrors: { error: string; count: number }[];
}

export interface InsightsResponse {
  summary: string;
  insights: AIInsight[];
  analytics: AnalyticsData;
  generatedAt: string;
}

// API Client
class ApiService {
  private baseUrl: string;
  private shopDomain: string;

  constructor(shopDomain: string) {
    this.baseUrl = API_BASE_URL;
    this.shopDomain = shopDomain;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'X-Shop-Domain': this.shopDomain,
      'Accept': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `API Error: ${response.status}`);
      }

      // Handle 204 No Content responses (common for DELETE operations)
      if (response.status === 204) {
        return undefined as T;
      }

      // Check if response has content before trying to parse JSON
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');

      if (!contentType?.includes('application/json') || contentLength === '0') {
        return undefined as T;
      }

      const json = await response.json();

      // Handle backend response wrapper pattern { success: true, data: ... }
      if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
        return json.data as T;
      }

      return json as T;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // Dashboard
  async getDashboardStats(): Promise<DashboardStats> {
    return this.request<DashboardStats>('/api/dashboard/stats');
  }

  async getRecentLogins(limit = 5): Promise<LoginActivity[]> {
    return this.request<LoginActivity[]>(`/api/dashboard/recent-logins?limit=${limit}`);
  }

  async getOnboardingStatus(): Promise<OnboardingStatus> {
    return this.request<OnboardingStatus>('/api/onboarding/status');
  }

  async completeOnboardingStep(step: string): Promise<void> {
    return this.request('/api/onboarding/complete-step', {
      method: 'POST',
      body: JSON.stringify({ step }),
    });
  }

  // SSO Providers
  async getProviders(): Promise<SSOProvider[]> {
    return this.request<SSOProvider[]>('/api/providers');
  }

  async getProvider(id: string): Promise<SSOProvider> {
    return this.request<SSOProvider>(`/api/providers/${id}`);
  }

  async getProviderWithDetails(id: string): Promise<{
    provider: SSOProvider & {
      _count: { userLinks: number; loginFlows: number };
    };
    recentLogins: any[];
  }> {
    return this.request(`/api/providers/${id}/details`);
  }

  async createProvider(data: Partial<SSOProvider>): Promise<SSOProvider> {
    return this.request<SSOProvider>('/api/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProvider(id: string, data: Partial<SSOProvider>): Promise<SSOProvider> {
    return this.request<SSOProvider>(`/api/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProvider(id: string): Promise<void> {
    return this.request(`/api/providers/${id}`, {
      method: 'DELETE',
    });
  }

  async testProviderConnection(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/providers/${id}/test`, {
      method: 'POST',
    });
  }

  async toggleProviderStatus(id: string, enabled: boolean): Promise<SSOProvider> {
    return this.request<SSOProvider>(`/api/providers/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }

  // Users
  async getUsers(params?: { 
    search?: string; 
    status?: string; 
    page?: number; 
    limit?: number 
  }): Promise<{ users: User[]; total: number; page: number }> {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.set('search', params.search);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));
    
    return this.request(`/api/users?${queryParams.toString()}`);
  }

  async getUser(id: string): Promise<User> {
    return this.request<User>(`/api/users/${id}`);
  }

  async createUser(data: Partial<User>): Promise<User> {
    return this.request<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return this.request<User>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: string): Promise<void> {
    return this.request(`/api/users/${id}`, {
      method: 'DELETE',
    });
  }

  async importUsers(users: Partial<User>[]): Promise<{ imported: number; failed: number }> {
    return this.request('/api/users/import', {
      method: 'POST',
      body: JSON.stringify({ users }),
    });
  }

  async importUsersFromCSV(data: {
    csvData: string;
    organizationId?: string;
  }): Promise<{ success: boolean; created: number; skipped: number }> {
    return this.request('/api/users/import-csv', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createSingleUser(data: {
    email: string;
    firstName?: string;
    lastName?: string;
    organizationId?: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.request('/api/users', {
      method: 'POST',
      body: JSON.stringify({ ...data, status: 'pending' }),
    });
  }

  // Settings
  async getSettings(): Promise<Record<string, any>> {
    return this.request('/api/settings');
  }

  async updateSettings(settings: Record<string, any>): Promise<void> {
    return this.request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // Plans
  async getCurrentPlan(): Promise<{ plan: string; features: string[] }> {
    return this.request('/api/billing/plan');
  }

  async upgradePlan(planId: string): Promise<{ confirmationUrl: string }> {
    return this.request('/api/billing/upgrade', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    });
  }

  // Audit Logs
  async getAuditLogs(params?: {
    action?: string;
    page?: number;
    limit?: number;
  }): Promise<{ logs: AuditLog[]; total: number; page: number; actionTypes: string[] }> {
    const queryParams = new URLSearchParams();
    if (params?.action) queryParams.set('action', params.action);
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));

    return this.request(`/api/audit-logs?${queryParams.toString()}`);
  }

  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    return this.request<Organization[]>('/api/organizations');
  }

  async getOrganization(id: string): Promise<Organization> {
    return this.request<Organization>(`/api/organizations/${id}`);
  }

  async createOrganization(data: Partial<Organization>): Promise<Organization> {
    return this.request<Organization>('/api/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateOrganization(id: string, data: Partial<Organization>): Promise<Organization> {
    return this.request<Organization>(`/api/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteOrganization(id: string): Promise<void> {
    return this.request(`/api/organizations/${id}`, {
      method: 'DELETE',
    });
  }

  // Domains
  async getDomains(): Promise<VerifiedDomain[]> {
    return this.request<VerifiedDomain[]>('/api/domains');
  }

  async getDomain(id: string): Promise<VerifiedDomain> {
    return this.request<VerifiedDomain>(`/api/domains/${id}`);
  }

  async createDomain(data: Partial<VerifiedDomain>): Promise<VerifiedDomain> {
    return this.request<VerifiedDomain>('/api/domains', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyDomain(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/domains/${id}/verify`, {
      method: 'POST',
    });
  }

  async deleteDomain(id: string): Promise<void> {
    return this.request(`/api/domains/${id}`, {
      method: 'DELETE',
    });
  }

  // Insights
  async getInsights(): Promise<InsightsResponse> {
    return this.request<InsightsResponse>('/api/insights');
  }

  async getAnalytics(): Promise<AnalyticsData> {
    return this.request<AnalyticsData>('/api/insights/analytics');
  }

  async refreshInsights(): Promise<InsightsResponse> {
    return this.request<InsightsResponse>('/api/insights/refresh', {
      method: 'POST',
    });
  }
}

// Factory function to create API service
export function createApiService(shopDomain: string): ApiService {
  return new ApiService(shopDomain);
}

// Predefined Provider Templates
export const SAML_PROVIDER_TEMPLATES = {
  azure_ad: {
    name: 'Microsoft Entra ID (Azure AD)',
    icon: '🔷',
    description: 'Enterprise SSO with Microsoft Azure Active Directory',
    fields: {
      entityId: { label: 'Application ID (Entity ID)', required: true },
      ssoUrl: { label: 'Login URL', required: true },
      certificate: { label: 'Certificate (Base64)', required: true },
    },
    helpUrl: 'https://docs.microsoft.com/azure/active-directory/saas-apps',
    setupSteps: [
      'Go to Azure Portal → Azure Active Directory → Enterprise Applications',
      'Click "New application" → "Create your own application"',
      'Select "Integrate any other application you don\'t find in the gallery"',
      'Go to Single Sign-On → SAML',
      'Copy the values below to configure your Azure AD application',
    ],
  },
  salesforce: {
    name: 'Salesforce',
    icon: '☁️',
    description: 'Enterprise SSO with Salesforce Identity',
    fields: {
      entityId: { label: 'Issuer', required: true },
      ssoUrl: { label: 'Identity Provider Login URL', required: true },
      certificate: { label: 'Identity Provider Certificate', required: true },
    },
    helpUrl: 'https://help.salesforce.com/s/articleView?id=sf.sso_saml.htm',
    setupSteps: [
      'Go to Salesforce Setup → Identity → Single Sign-On Settings',
      'Enable SAML and click "New from Metadata File" or configure manually',
      'Upload the Service Provider metadata or enter values manually',
      'Save and copy the Identity Provider details below',
    ],
  },
  okta: {
    name: 'Okta',
    icon: '🔐',
    description: 'Enterprise SSO with Okta',
    fields: {
      entityId: { label: 'Identity Provider Issuer', required: true },
      ssoUrl: { label: 'Identity Provider Single Sign-On URL', required: true },
      certificate: { label: 'X.509 Certificate', required: true },
    },
    helpUrl: 'https://help.okta.com/en-us/Content/Topics/Apps/Apps_App_Integration_Wizard_SAML.htm',
    setupSteps: [
      'Go to Okta Admin Console → Applications → Create App Integration',
      'Select SAML 2.0 and click Next',
      'Enter the app name and configure SAML settings',
      'Copy the Identity Provider metadata values below',
    ],
  },
  custom: {
    name: 'Custom SAML Provider',
    icon: '⚙️',
    description: 'Configure any SAML 2.0 compliant Identity Provider',
    fields: {
      entityId: { label: 'Entity ID (Issuer)', required: true },
      ssoUrl: { label: 'SSO URL (Login Endpoint)', required: true },
      certificate: { label: 'X.509 Certificate', required: true },
      sloUrl: { label: 'Single Logout URL', required: false },
    },
    helpUrl: '',
    setupSteps: [
      'Obtain the SAML metadata from your Identity Provider',
      'Enter the Entity ID, SSO URL, and Certificate below',
      'Configure your IdP with our Service Provider metadata',
    ],
  },
};

export const OAUTH_PROVIDER_TEMPLATES = {
  google: {
    name: 'Google',
    icon: '🔴',
    description: 'Sign in with Google accounts',
    fields: {
      clientId: { label: 'Client ID', required: true },
      clientSecret: { label: 'Client Secret', required: true },
    },
    helpUrl: 'https://developers.google.com/identity/protocols/oauth2',
    setupSteps: [
      'Go to Google Cloud Console → APIs & Services → Credentials',
      'Click "Create Credentials" → "OAuth client ID"',
      'Select "Web application" as the application type',
      'Add the authorized redirect URI shown below',
      'Copy the Client ID and Client Secret',
    ],
    scopes: ['openid', 'email', 'profile'],
  },
  facebook: {
    name: 'Facebook',
    icon: '🔵',
    description: 'Sign in with Facebook accounts',
    fields: {
      clientId: { label: 'App ID', required: true },
      clientSecret: { label: 'App Secret', required: true },
    },
    helpUrl: 'https://developers.facebook.com/docs/facebook-login/web',
    setupSteps: [
      'Go to Facebook Developers → My Apps → Create App',
      'Select "Consumer" or "Business" as the app type',
      'Add "Facebook Login" product to your app',
      'Configure the Valid OAuth Redirect URI',
      'Copy the App ID and App Secret from Settings → Basic',
    ],
    scopes: ['email', 'public_profile'],
  },
  custom: {
    name: 'Custom OAuth Provider',
    icon: '⚙️',
    description: 'Configure any OAuth 2.0 compliant provider',
    fields: {
      clientId: { label: 'Client ID', required: true },
      clientSecret: { label: 'Client Secret', required: true },
      authorizationUrl: { label: 'Authorization URL', required: true },
      tokenUrl: { label: 'Token URL', required: true },
      userInfoUrl: { label: 'User Info URL', required: true },
      scopes: { label: 'Scopes (comma-separated)', required: false },
    },
    helpUrl: '',
    setupSteps: [
      'Register an OAuth application with your provider',
      'Configure the redirect URI shown below',
      'Enter the OAuth endpoints and credentials',
    ],
    scopes: [],
  },
};

export type SamlProviderType = keyof typeof SAML_PROVIDER_TEMPLATES;
export type OAuthProviderType = keyof typeof OAUTH_PROVIDER_TEMPLATES;
