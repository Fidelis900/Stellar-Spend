import type { GraphQLContext } from './resolvers';

export class GraphQLError extends Error {
  constructor(
    message: string,
    public extensions?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'GraphQLError';
  }
}

export function requireAuth(ctx: GraphQLContext): void {
  if (!ctx.isAuthenticated) {
    throw new GraphQLError('Unauthorized: authentication required', {
      code: 'UNAUTHORIZED',
      httpStatus: 401,
    });
  }
}

export function requireRole(ctx: GraphQLContext, role: 'admin' | 'ops'): void {
  requireAuth(ctx);
  if (ctx.role !== role && ctx.role !== 'admin') {
    throw new GraphQLError(`Forbidden: requires ${role} role`, {
      code: 'FORBIDDEN',
      httpStatus: 403,
    });
  }
}

/**
 * Enforce a maximum query depth to prevent complex / abusive queries.
 */
export const MAX_DEPTH = 7;

export function validateQueryDepth(fieldNames: string[], depth = 0): void {
  if (depth > MAX_DEPTH) {
    throw new GraphQLError(`Query exceeds maximum depth of ${MAX_DEPTH}`, {
      code: 'QUERY_TOO_DEEP',
      httpStatus: 400,
    });
  }
}

/**
 * Enforce a maximum node count (breadth × depth).
 */
export const MAX_NODES = 500;
let nodeCount = 0;

export function countNode(): void {
  nodeCount++;
  if (nodeCount > MAX_NODES) {
    throw new GraphQLError(`Query exceeds maximum complexity of ${MAX_NODES} nodes`, {
      code: 'QUERY_TOO_COMPLEX',
      httpStatus: 400,
    });
  }
}

export function resetNodeCount(): void {
  nodeCount = 0;
}
