import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/index.js';

/**
 * Validation middleware using Zod schemas
 *
 * Validates request body, query params, and route params against Zod schemas.
 */

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Format Zod errors for API response
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'value';
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }

  return formatted;
}

/**
 * Create validation middleware for Fastify routes
 */
export function validateRequest(schemas: ValidationSchemas) {
  return async (
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction
  ) => {
    try {
      // Validate body
      if (schemas.body) {
        const result = schemas.body.safeParse(request.body);
        if (!result.success) {
          throw new ValidationError('Request body validation failed', {
            errors: formatZodErrors(result.error),
          });
        }
        request.body = result.data;
      }

      // Validate query params
      if (schemas.query) {
        const result = schemas.query.safeParse(request.query);
        if (!result.success) {
          throw new ValidationError('Query parameters validation failed', {
            errors: formatZodErrors(result.error),
          });
        }
        request.query = result.data;
      }

      // Validate route params
      if (schemas.params) {
        const result = schemas.params.safeParse(request.params);
        if (!result.success) {
          throw new ValidationError('Route parameters validation failed', {
            errors: formatZodErrors(result.error),
          });
        }
        request.params = result.data;
      }

      done();
    } catch (error) {
      done(error as Error);
    }
  };
}

/**
 * Decorator-style validation for route handlers
 * Returns a preHandler hook for Fastify
 */
export function validate(schemas: ValidationSchemas) {
  return {
    preHandler: validateRequest(schemas),
  };
}
