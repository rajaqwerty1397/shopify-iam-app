import { PaginationInput, SortInput } from '../schemas/index.js';

/**
 * Pagination utilities for database queries
 */

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Calculate pagination offset
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Build pagination result object
 */
export function paginateResult<T>(
  data: T[],
  total: number,
  pagination: PaginationInput
): PaginationResult<T> {
  return {
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
}

/**
 * Build Prisma orderBy object from sort input
 */
export function buildOrderBy(
  sort: SortInput,
  defaultField: string = 'createdAt'
): Record<string, 'asc' | 'desc'> {
  const field = sort.sortBy || defaultField;
  return { [field]: sort.sortOrder };
}

/**
 * Build Prisma pagination object
 */
export function buildPrismaQuery(pagination: PaginationInput, sort?: SortInput) {
  return {
    skip: calculateOffset(pagination.page, pagination.limit),
    take: pagination.limit,
    ...(sort && { orderBy: buildOrderBy(sort) }),
  };
}
