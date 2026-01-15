import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma.js';

/**
 * Prisma Plugin
 *
 * Adds Prisma client to Fastify instance for database access.
 */

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

async function prismaPlugin(fastify: FastifyInstance) {
  // Decorate fastify with prisma
  fastify.decorate('prisma', prisma);

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}

export default fp(prismaPlugin, {
  name: 'prisma',
});
