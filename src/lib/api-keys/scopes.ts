import type { ApiKeyRecord } from './types';

export type ScopeAction = 'read' | 'write' | 'admin';
export type ScopeResource =
  | 'quotes'
  | 'payouts'
  | 'transactions'
  | 'analytics'
  | 'wallets'
  | 'webhooks'
  | 'api-keys'
  | 'merchant'
  | '*';

export type Scope = `${ScopeAction}:${ScopeResource}` | 'admin:*';

export const SCOPE_CATALOG: Record<Scope, { description: string }> = {
  'admin:*': { description: 'Full administrative access to all resources' },
  'read:quotes': { description: 'Read exchange rate quotes' },
  'read:transactions': { description: 'Read transaction records' },
  'write:transactions': { description: 'Create and update transactions' },
  'write:payouts': { description: 'Execute and manage payouts' },
  'read:analytics': { description: 'Read analytics data' },
  'read:wallets': { description: 'Read wallet information' },
  'read:webhooks': { description: 'Read webhook configurations' },
  'write:webhooks': { description: 'Create and update webhooks' },
  'read:api-keys': { description: 'Read API key metadata' },
  'write:api-keys': { description: 'Create and manage API keys' },
  'read:merchant': { description: 'Read merchant profile and settings' },
  'write:merchant': { description: 'Create and update merchant accounts' },
};

export const SCOPE_HIERARCHY: Record<string, string[]> = {
  'admin:*': Object.keys(SCOPE_CATALOG),
};

interface RouteScopeEntry {
  method: string;
  pathPattern: RegExp;
  requiredScope: Scope;
}

const routeScopeEntries: RouteScopeEntry[] = [
  { method: 'GET', pathPattern: /^\/api\/v1\/offramp\/quote/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/offramp\/quote/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/v1\/offramp\/quote-aggregate/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/offramp\/quote-aggregate/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/v1\/offramp\/fees/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/offramp\/fees/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/v1\/offramp\/rate/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/offramp\/rate/, requiredScope: 'read:quotes' },

  { method: 'POST', pathPattern: /^\/api\/v1\/offramp\/execute-payout/, requiredScope: 'write:payouts' },
  { method: 'POST', pathPattern: /^\/api\/offramp\/execute-payout/, requiredScope: 'write:payouts' },
  { method: 'POST', pathPattern: /^\/api\/v1\/offramp\/paycrest\/order/, requiredScope: 'write:payouts' },
  { method: 'POST', pathPattern: /^\/api\/offramp\/paycrest\/order/, requiredScope: 'write:payouts' },

  { method: 'GET', pathPattern: /^\/api\/v1\/offramp\/status/, requiredScope: 'read:transactions' },
  { method: 'GET', pathPattern: /^\/api\/offramp\/status/, requiredScope: 'read:transactions' },
  // analytics must be before the catch-all /api/transactions pattern
  { method: 'GET', pathPattern: /^\/api\/transactions\/analytics/, requiredScope: 'read:analytics' },
  { method: 'GET', pathPattern: /^\/api\/transactions/, requiredScope: 'read:transactions' },
  { method: 'POST', pathPattern: /^\/api\/transactions$/, requiredScope: 'write:transactions' },
  { method: 'GET', pathPattern: /^\/api\/v1\/offramp\/reconciliation/, requiredScope: 'read:transactions' },
  { method: 'GET', pathPattern: /^\/api\/offramp\/reconciliation/, requiredScope: 'read:transactions' },

  { method: 'GET', pathPattern: /^\/api\/v1\/offramp\/currencies/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/offramp\/currencies/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/v1\/offramp\/institutions/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/offramp\/institutions/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/v1\/offramp\/verify-account/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/offramp\/verify-account/, requiredScope: 'read:quotes' },

  { method: 'GET', pathPattern: /^\/api\/v1\/fx-rates/, requiredScope: 'read:quotes' },
  { method: 'GET', pathPattern: /^\/api\/fx-rates/, requiredScope: 'read:quotes' },

  // ── Merchant routes ────────────────────────────────────────────────────────
  { method: 'GET', pathPattern: /^\/api\/merchant/, requiredScope: 'read:merchant' },
  { method: 'POST', pathPattern: /^\/api\/merchant/, requiredScope: 'write:merchant' },

  // ── Webhook subscription routes ────────────────────────────────────────────
  { method: 'GET', pathPattern: /^\/api\/webhooks\/subscriptions/, requiredScope: 'read:webhooks' },
  { method: 'POST', pathPattern: /^\/api\/webhooks\/subscriptions/, requiredScope: 'write:webhooks' },
  { method: 'GET', pathPattern: /^\/api\/webhooks\/delivery-log/, requiredScope: 'read:webhooks' },

  // ── Analytics routes ───────────────────────────────────────────────────────
  // (read:analytics for /api/transactions/analytics is registered above the transactions catch-all)
];

export function getRequiredScope(method: string, pathname: string): Scope | null {
  for (const entry of routeScopeEntries) {
    if (entry.method === method && entry.pathPattern.test(pathname)) {
      return entry.requiredScope;
    }
  }
  return null;
}

export function hasRequiredScope(apiKey: ApiKeyRecord, requiredScope: Scope): boolean {
  if (apiKey.scopes.includes('admin:*' as any) || apiKey.scopes.includes('admin' as any)) {
    return true;
  }

  const [requiredAction, requiredResource] = requiredScope.split(':') as [ScopeAction, ScopeResource];

  for (const assignedScope of apiKey.scopes) {
    if (assignedScope === 'admin:*' || assignedScope === 'admin') return true;

    const [assignedAction, assignedResource] = assignedScope.split(':') as [ScopeAction, ScopeResource];

    if (assignedResource === '*' || requiredResource === '*') {
      if (assignedResource === requiredResource) return true;
    }

    if (assignedAction === requiredAction && assignedResource === requiredResource) return true;

    if (assignedResource === '*' && assignedAction === requiredAction) return true;
    if (assignedAction === '*' && assignedResource === requiredResource) return true;
  }

  return false;
}
