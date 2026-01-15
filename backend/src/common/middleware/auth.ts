import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { encryptionService } from '../../services/encryption.service.js';
import {
  UnauthorizedError,
  StoreNotFoundError,
  StoreInactiveError,
} from '../errors/index.js';
import { Store, Subscription, Plan } from '@prisma/client';

/**
 * Authentication middleware for store-level access
 *
 * Verifies the request is from an authenticated store and
 * attaches store information to the request.
 */

// Extend FastifyRequest to include store context
declare module 'fastify' {
  interface FastifyRequest {
    store?: StoreContext;
    storeId?: string;
  }
}

export interface StoreCredentials {
  accessToken: string;
  multipassSecret?: string;
}

export interface StoreContext {
  id: string;
  domain: string;
  name: string;
  isPlus: boolean;
  status: string;
  credentials: StoreCredentials;
  subscription?: {
    id: string;
    status: string;
    planName: string;
    userLimit: number;
    currentUserCount: number;
  };
}

/**
 * Extract store ID from request
 * Supports multiple authentication methods
 */
function extractStoreId(request: FastifyRequest): string | null {
  // From route params
  if (request.params && typeof request.params === 'object') {
    const params = request.params as Record<string, string>;
    if (params.storeId) return params.storeId;
  }

  // From query params (for OAuth callbacks)
  if (request.query && typeof request.query === 'object') {
    const query = request.query as Record<string, string>;
    if (query.storeId) return query.storeId;
  }

  // From headers
  const storeIdHeader = request.headers['x-store-id'];
  if (typeof storeIdHeader === 'string') return storeIdHeader;

  // From session/cookie
  const sessionStoreId = (request as unknown as { session?: { storeId?: string } }).session?.storeId;
  if (sessionStoreId) return sessionStoreId;

  return null;
}

/**
 * Middleware to authenticate store requests
 */
export async function authenticateStore(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const storeId = extractStoreId(request);

  if (!storeId) {
    throw new UnauthorizedError('Store authentication required');
  }

  // Fetch store with subscription
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  if (!store) {
    throw new StoreNotFoundError();
  }

  if (store.status !== 'active') {
    throw new StoreInactiveError(`Store is ${store.status}`);
  }

  // Decrypt credentials
  const credentials = encryptionService.decrypt<StoreCredentials>(store.credentials);

  // Build store context
  const storeContext: StoreContext = {
    id: store.id,
    domain: store.domain,
    name: store.name,
    isPlus: store.isPlus,
    status: store.status,
    credentials,
    ...(store.subscription && {
      subscription: {
        id: store.subscription.id,
        status: store.subscription.status,
        planName: store.subscription.plan.name,
        userLimit: store.subscription.plan.userLimit,
        currentUserCount: store.subscription.currentUserCount,
      },
    }),
  };

  // Attach to request
  request.store = storeContext;
  request.storeId = store.id;
}

/**
 * Middleware to require Plus store
 */
export async function requirePlusStore(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  if (!request.store) {
    throw new UnauthorizedError('Store authentication required');
  }

  if (!request.store.isPlus) {
    throw new UnauthorizedError('Shopify Plus store required for this feature');
  }
}

/**
 * Middleware to require active subscription
 */
export async function requireActiveSubscription(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  if (!request.store) {
    throw new UnauthorizedError('Store authentication required');
  }

  if (!request.store.subscription) {
    throw new UnauthorizedError('Active subscription required');
  }

  const validStatuses = ['trialing', 'active'];
  if (!validStatuses.includes(request.store.subscription.status)) {
    throw new UnauthorizedError('Active subscription required');
  }
}

/**
 * Check if store can add more users
 */
export function canAddUser(store: StoreContext): boolean {
  if (!store.subscription) return false;

  const { userLimit, currentUserCount } = store.subscription;

  // -1 means unlimited
  if (userLimit === -1) return true;

  return currentUserCount < userLimit;
}

/**
 * Middleware factory for feature-gated access
 */
export function requireFeature(featureName: string) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.store?.subscription) {
      throw new UnauthorizedError('Active subscription required');
    }

    // Get plan features from database
    const subscription = await prisma.subscription.findUnique({
      where: { id: request.store.subscription.id },
      include: { plan: true },
    });

    const features = subscription?.plan.features as Record<string, unknown> | null;

    if (!features || !features[featureName]) {
      throw new UnauthorizedError(`Feature '${featureName}' not available in current plan`);
    }
  };
}
