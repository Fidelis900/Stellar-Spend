import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We import after manipulating process.env so we need to re-import each time.
// Use vi.resetModules() to get a fresh module per test group.

describe('getAllowedOrigins', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS;
  });

  it('returns dev defaults when ALLOWED_ORIGINS is not set', async () => {
    delete process.env.ALLOWED_ORIGINS;
    const { getAllowedOrigins } = await import('@/lib/cors');
    const origins = getAllowedOrigins();
    expect(origins).toContain('http://localhost:3001');
    expect(origins.length).toBeGreaterThan(0);
  });

  it('parses comma-separated ALLOWED_ORIGINS', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://www.example.com';
    const { getAllowedOrigins } = await import('@/lib/cors');
    expect(getAllowedOrigins()).toEqual(['https://app.example.com', 'https://www.example.com']);
  });

  it('trims whitespace around origins', async () => {
    process.env.ALLOWED_ORIGINS = ' https://a.com , https://b.com ';
    const { getAllowedOrigins } = await import('@/lib/cors');
    expect(getAllowedOrigins()).toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('resolveOrigin', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS;
  });

  it('returns the origin when it is in the allowed list', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    const { resolveOrigin } = await import('@/lib/cors');
    expect(resolveOrigin('https://app.example.com')).toBe('https://app.example.com');
  });

  it('returns null for an unknown origin', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    const { resolveOrigin } = await import('@/lib/cors');
    expect(resolveOrigin('https://evil.com')).toBeNull();
  });

  it('returns null when requestOrigin is null', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    const { resolveOrigin } = await import('@/lib/cors');
    expect(resolveOrigin(null)).toBeNull();
  });

  it('allows localhost origins by default (no env var)', async () => {
    delete process.env.ALLOWED_ORIGINS;
    const { resolveOrigin } = await import('@/lib/cors');
    expect(resolveOrigin('http://localhost:3001')).toBe('http://localhost:3001');
    expect(resolveOrigin('https://evil.com')).toBeNull();
  });
});
