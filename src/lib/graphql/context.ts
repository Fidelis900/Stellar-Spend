import type { GraphQLContext } from './resolvers';

/**
 * Build GraphQL context from an incoming Next.js request.
 * Extracts userId from Authorization header (Bearer token or API key).
 */
export function buildContext(request: Request): GraphQLContext {
  const authHeader = request.headers.get('authorization') ?? '';
  const apiKey = request.headers.get('x-api-key') ?? '';

  // Simple token extraction — in production, verify JWT or API key against DB
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : apiKey;
  const isAuthenticated = token.length > 0;

  // Decode userId from token (placeholder — replace with real JWT decode)
  let userId: string | undefined;
  let isPremium = false;
  let role: 'user' | 'admin' | 'ops' | undefined;

  if (isAuthenticated) {
    // In production: verify JWT and extract claims
    userId = `user_${token.slice(0, 8)}`;
    isPremium = token.startsWith('premium_');

    // Simple role inference from header (replace with real JWT claim extraction)
    const roleHeader = request.headers.get('x-role') ?? '';
    if (roleHeader === 'admin') role = 'admin';
    else if (roleHeader === 'ops') role = 'ops';
    else role = 'user';
  }

  return { userId, isPremium, isAuthenticated, role };
}
