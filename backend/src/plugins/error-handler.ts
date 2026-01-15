import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../common/errors/index.js';
import { createModuleLogger } from '../lib/logger.js';
import { ZodError } from 'zod';

const logger = createModuleLogger('ErrorHandler');

/**
 * Global Error Handler Plugin
 *
 * Handles all errors thrown during request processing and
 * returns consistent error responses.
 */
async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler(
    async (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
      // Log the error
      logger.error(
        {
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          request: {
            method: request.method,
            url: request.url,
            params: request.params,
            query: request.query,
          },
        },
        'Request error'
      );

      // Handle AppError (our custom errors)
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      // Handle Zod validation errors
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: 'validation_failed',
          message: 'Validation failed',
          details: { errors: error.errors },
        });
      }

      // Handle Fastify validation errors
      if ('validation' in error && error.validation) {
        return reply.status(400).send({
          error: 'validation_failed',
          message: 'Validation failed',
          details: { errors: error.validation },
        });
      }

      // Handle Prisma errors
      if (error.name === 'PrismaClientKnownRequestError') {
        const prismaError = error as Error & { code: string; meta?: { target?: string[] } };

        if (prismaError.code === 'P2002') {
          return reply.status(409).send({
            error: 'duplicate_resource',
            message: 'Resource already exists',
            details: { fields: prismaError.meta?.target },
          });
        }

        if (prismaError.code === 'P2025') {
          return reply.status(404).send({
            error: 'not_found',
            message: 'Resource not found',
          });
        }
      }

      // Handle rate limit errors
      if ('statusCode' in error && error.statusCode === 429) {
        return reply.status(429).send({
          error: 'rate_limit_exceeded',
          message: 'Rate limit exceeded',
        });
      }

      // Default to 500 Internal Server Error
      return reply.status(500).send({
        error: 'internal_error',
        message: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && {
          details: {
            message: error.message,
            stack: error.stack,
          },
        }),
      });
    }
  );

  // Handle 404 Not Found
  fastify.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: 'not_found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
