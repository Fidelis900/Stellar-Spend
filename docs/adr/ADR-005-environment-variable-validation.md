# ADR-005: Environment Variable Validation Approach

**Status:** Accepted  
**Date:** 2025-01-01  
**Deciders:** Stellar-Spend core team

---

## Context

Stellar-Spend requires several secrets and configuration values at runtime (Paycrest API keys, blockchain RPC endpoints, private keys for Base transactions). Missing or misconfigured environment variables caused confusing runtime failures — the server would start, accept requests, and then throw cryptic errors deep inside a handler when the missing value was first used.

Two categories of environment variables require different handling:

1. **Server-only secrets** — must never be exposed to the browser (e.g., `PAYCREST_API_KEY`, `BASE_PRIVATE_KEY`). If accidentally prefixed with `NEXT_PUBLIC_`, they would be bundled into the client JS.
2. **Public browser variables** — must be present for client-side code to function (e.g., `NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL`).

Additional risk: a developer might accidentally expose a secret by adding the `NEXT_PUBLIC_` prefix, thinking it needs to be available on the client.

Options considered:

1. **No validation** — rely on runtime errors when a value is missing. Fails late with poor error messages.
2. **Runtime checks at call site** — `if (!process.env.X) throw new Error(...)` scattered through code. Repetitive, easy to miss.
3. **Centralised `validateEnv()` at module load time** — validates all required keys once at startup, fails fast with a clear diagnostic message, and returns a typed `env` object used throughout the codebase.
4. **Third-party schema validation** (e.g., Zod) — powerful but adds a dependency for what is a small, stable schema.

---

## Decision

A **centralised `validateEnv()` function** in `src/lib/env.ts` is called at module-load time (not request time). It:

1. Checks all required server-only keys are present and non-empty.
2. Checks all required public keys are present.
3. Checks that known secret keys (`PAYCREST_API_KEY`, `BASE_PRIVATE_KEY`) are NOT present with the `NEXT_PUBLIC_` prefix.
4. If any check fails, throws a single `Error` with a human-readable diagnostic listing all problems.
5. On success, returns a typed `env` object:
   ```ts
   export const env = validateEnv();
   // env.server.PAYCREST_API_KEY  ← string, guaranteed present
   // env.public.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL ← string, guaranteed present
   ```

No third-party schema library is used — the validation logic is ~60 lines of plain TypeScript.

The `env` export is imported by adapters and route handlers instead of reading `process.env` directly. This makes the access pattern explicit and provides TypeScript's type system assurance that the values are strings (not `string | undefined`).

---

## Consequences

**Positive:**

- The server fails **immediately at startup** if required environment variables are missing, with a message listing exactly which keys need to be set.
- The forbidden-public-key check prevents accidental secret exposure in the client bundle.
- TypeScript types for `env.server.*` and `env.public.*` eliminate `undefined` handling at call sites.
- The validation logic is self-contained, easy to read, and easy to extend when new required variables are added.

**Negative / Trade-offs:**

- Every test file that imports any module which transitively imports `env.ts` needs the required environment variables set, or must mock the module. Tests use `vi.mock('@/lib/env', ...)` to avoid this.
- The validation runs eagerly on module load, which means it runs even in contexts where only a subset of variables is needed (e.g., a pure browser component that should never touch server secrets).
- No runtime coercion (strings are not parsed to numbers, booleans, or URLs) — callers are responsible for parsing when needed.

**Migration note:**  
When adding new required environment variables, update:

1. `src/lib/env.ts` — add to `requiredServerEnvKeys` or `requiredPublicEnvKeys`.
2. `.env.example` — document the new variable with a comment.
3. Docker and CI environment variable lists.

---

_Related: [[ADR-004-api-versioning-strategy]]_
