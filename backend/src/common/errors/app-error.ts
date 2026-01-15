/**
 * Application Error Classes
 *
 * Standardized error handling with readable error names for API responses.
 * All errors extend AppError for consistent handling.
 */

export interface ErrorDetails {
  field?: string;
  value?: unknown;
  constraint?: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly error: string;
  public readonly isOperational: boolean;
  public readonly details?: ErrorDetails;

  constructor(
    message: string,
    statusCode: number,
    error: string,
    details?: ErrorDetails,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      error: this.error,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

// =============================================================================
// Authentication Errors
// =============================================================================

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: ErrorDetails) {
    super(message, 401, 'unauthorized', details);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = 'Invalid credentials', details?: ErrorDetails) {
    super(message, 401, 'invalid_credentials', details);
  }
}

export class SessionExpiredError extends AppError {
  constructor(message = 'Session expired', details?: ErrorDetails) {
    super(message, 401, 'session_expired', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden', details?: ErrorDetails) {
    super(message, 403, 'forbidden', details);
  }
}

export class InsufficientPermissionsError extends AppError {
  constructor(message = 'Insufficient permissions', details?: ErrorDetails) {
    super(message, 403, 'insufficient_permissions', details);
  }
}

// =============================================================================
// Provider Errors
// =============================================================================

export class ProviderNotConfiguredError extends AppError {
  constructor(provider?: string, details?: ErrorDetails) {
    super(
      provider ? `Provider '${provider}' is not configured` : 'Provider not configured',
      400,
      'provider_not_configured',
      details
    );
  }
}

export class ProviderDisabledError extends AppError {
  constructor(provider?: string, details?: ErrorDetails) {
    super(
      provider ? `Provider '${provider}' is disabled` : 'Provider is disabled',
      400,
      'provider_disabled',
      details
    );
  }
}

export class ProviderAuthError extends AppError {
  constructor(message = 'Authentication with provider failed', details?: ErrorDetails) {
    super(message, 400, 'provider_auth_failed', details);
  }
}

export class InvalidSamlResponseError extends AppError {
  constructor(message = 'Invalid SAML response', details?: ErrorDetails) {
    super(message, 400, 'invalid_saml_response', details);
  }
}

export class InvalidOidcTokenError extends AppError {
  constructor(message = 'Invalid OIDC token', details?: ErrorDetails) {
    super(message, 400, 'invalid_oidc_token', details);
  }
}

// =============================================================================
// User Errors
// =============================================================================

export class UserLimitExceededError extends AppError {
  constructor(limit?: number, details?: ErrorDetails) {
    super(
      limit ? `User limit of ${limit} exceeded` : 'User limit exceeded',
      402,
      'user_limit_exceeded',
      details
    );
  }
}

export class UserBlockedError extends AppError {
  constructor(message = 'User account is blocked', details?: ErrorDetails) {
    super(message, 403, 'user_blocked', details);
  }
}

export class UserNotFoundError extends AppError {
  constructor(message = 'User not found', details?: ErrorDetails) {
    super(message, 404, 'user_not_found', details);
  }
}

export class DuplicateUserError extends AppError {
  constructor(message = 'User already exists', details?: ErrorDetails) {
    super(message, 409, 'duplicate_user', details);
  }
}

// =============================================================================
// Store Errors
// =============================================================================

export class StoreNotFoundError extends AppError {
  constructor(message = 'Store not found', details?: ErrorDetails) {
    super(message, 404, 'store_not_found', details);
  }
}

export class StoreInactiveError extends AppError {
  constructor(message = 'Store is inactive', details?: ErrorDetails) {
    super(message, 403, 'store_inactive', details);
  }
}

export class StoreSuspendedError extends AppError {
  constructor(message = 'Store is suspended', details?: ErrorDetails) {
    super(message, 403, 'store_suspended', details);
  }
}

// =============================================================================
// Subscription Errors
// =============================================================================

export class SubscriptionRequiredError extends AppError {
  constructor(message = 'Active subscription required', details?: ErrorDetails) {
    super(message, 402, 'subscription_required', details);
  }
}

export class SubscriptionExpiredError extends AppError {
  constructor(message = 'Subscription has expired', details?: ErrorDetails) {
    super(message, 402, 'subscription_expired', details);
  }
}

export class FeatureNotAvailableError extends AppError {
  constructor(feature?: string, details?: ErrorDetails) {
    super(
      feature ? `Feature '${feature}' not available in current plan` : 'Feature not available',
      402,
      'feature_not_available',
      details
    );
  }
}

// =============================================================================
// Validation Errors
// =============================================================================

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: ErrorDetails) {
    super(message, 400, 'validation_failed', details);
  }
}

export class InvalidInputError extends AppError {
  constructor(message = 'Invalid input', details?: ErrorDetails) {
    super(message, 400, 'invalid_input', details);
  }
}

export class MissingRequiredFieldError extends AppError {
  constructor(field: string, details?: ErrorDetails) {
    super(`Missing required field: ${field}`, 400, 'missing_required_field', { field, ...details });
  }
}

// =============================================================================
// Resource Errors
// =============================================================================

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', details?: ErrorDetails) {
    super(`${resource} not found`, 404, 'not_found', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: ErrorDetails) {
    super(message, 409, 'conflict', details);
  }
}

export class DuplicateResourceError extends AppError {
  constructor(resource = 'Resource', details?: ErrorDetails) {
    super(`${resource} already exists`, 409, 'duplicate_resource', details);
  }
}

// =============================================================================
// System Errors
// =============================================================================

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details?: ErrorDetails) {
    super(message, 500, 'internal_error', details, false);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', details?: ErrorDetails) {
    super(message, 503, 'service_unavailable', details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, details?: ErrorDetails) {
    super(`External service error: ${service}`, 502, 'external_service_error', details);
  }
}

export class RateLimitExceededError extends AppError {
  constructor(message = 'Rate limit exceeded', details?: ErrorDetails) {
    super(message, 429, 'rate_limit_exceeded', details);
  }
}