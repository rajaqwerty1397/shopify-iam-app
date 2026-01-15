import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

// Prevent multiple instances during hot reload in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Check if Prisma Client is generated
let prismaClient: PrismaClient;
try {
  prismaClient = new PrismaClient({
    log: config.isDev ? ['query', 'error', 'warn'] : ['error'],
    errorFormat: config.isDev ? 'pretty' : 'minimal',
  });
} catch (error) {
  console.error('❌ Failed to create Prisma Client');
  console.error('Please run: npm run db:generate');
  console.error('Error:', error);
  throw error;
}

export const prisma =
  globalForPrisma.prisma ?? prismaClient;

if (config.isDev) {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
