/**
 * Production Smoke-Test Suite — #690
 *
 * Smoke Checklist (all must pass to allow a blue-green swap):
 *  [1] GET  /api/health              → 200, status healthy|degraded
 *  [2] GET  /api/offramp/currencies  → 200, array ≥ 1 item
 *  [3] GET  /api/offramp/rate        → 200, rate > 0
 *  [4] POST /api/offramp/quote       → < 500 (external deps may 502 in sandbox)
 *  [5] GET  /api/offramp/bridge/gas-fee-options → < 500
 *  [6] GET  /                        → page renders with title + connect button
 *  [7] UI renders without JS console errors
 *  [8] Service worker registers
 *
 * Budget: entire suite must finish within SMOKE_BUDGET_MS (default 60 s).
 *
 * Alert hook: set SMOKE_ALERT_WEBHOOK to a Slack/Discord URL; failures POST there.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001';
const SMOKE_BUDGET_MS = Number(process.env.SMOKE_BUDGET_MS ?? 60_000);
const SMOKE_ALERT_WEBHOOK = process.env.SMOKE_ALERT_WEBHOOK ?? '';

// ── Alert stub ───────────────────────────────────────────────────────────────

async function alertOnFailure(
  request: APIRequestContext,
  testName: string,
  error: string,
): Promise<void> {
  if (!SMOKE_ALERT_WEBHOOK) return;
  try {
    await request.post(SMOKE_ALERT_WEBHOOK, {
      data: {
        text: `🚨 *Smoke test FAILED* — \`${testName}\`\n> ${error}\n> Deploy may be blocked.`,
      },
      timeout: 5_000,
    });
  } catch {
    // webhook failure must never cause the test to throw differently
  }
}

// ── Suite ────────────────────────────────────────────────────────────────────

test.describe('Production Smoke Tests', () => {
  // Enforce total-suite wall-clock budget
  test.setTimeout(SMOKE_BUDGET_MS);

  // ── [1] Health ─────────────────────────────────────────────────────────────
  test('[1] GET /api/health returns healthy or degraded', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`, { timeout: 10_000 });
    expect(res.status(), 'health endpoint must return 200').toBe(200);

    const data = await res.json();
    expect(data.status, 'status must be healthy or degraded').toMatch(/^(healthy|degraded)$/);
    expect(data.timestamp, 'timestamp must be present').toBeDefined();
    expect(data.version, 'version must be present').toBeDefined();
  });

  // ── [2] Currencies ─────────────────────────────────────────────────────────
  test('[2] GET /api/offramp/currencies returns at least one currency', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/offramp/currencies`, { timeout: 10_000 });
    expect(res.status(), 'currencies endpoint must return 200').toBe(200);

    const data = await res.json();
    // Accepts { currencies: [...] } or direct array
    const list: unknown[] = Array.isArray(data) ? data : data.currencies;
    expect(Array.isArray(list), 'currencies must be an array').toBe(true);
    expect(list.length, 'at least one currency must exist').toBeGreaterThan(0);
  });

  // ── [3] FX Rate ────────────────────────────────────────────────────────────
  test('[3] GET /api/offramp/rate returns a positive rate', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/offramp/rate`, { timeout: 10_000 });
    expect(res.status(), 'rate endpoint must return 200').toBe(200);

    const data = await res.json();
    expect(typeof data.rate === 'number' && data.rate > 0, 'rate must be a positive number').toBe(
      true,
    );
  });

  // ── [4] Quote (read-only; 502 acceptable in sandbox) ──────────────────────
  test('[4] POST /api/offramp/quote responds without server error', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/offramp/quote`, {
      data: { amount: '100', currency: 'NGN', feeMethod: 'USDC' },
      timeout: 15_000,
    });
    expect(res.status(), 'quote endpoint must not return a 5xx server error').toBeLessThan(500);

    if (res.status() === 200) {
      const data = await res.json();
      expect(typeof data.destinationAmount).toBe('string');
      expect(data.rate).toBeGreaterThan(0);
    }
  });

  // ── [5] Gas fee options ────────────────────────────────────────────────────
  test('[5] GET /api/offramp/bridge/gas-fee-options responds without server error', async ({
    request,
  }) => {
    const res = await request.get(`${BASE_URL}/api/offramp/bridge/gas-fee-options`, {
      timeout: 10_000,
    });
    expect(res.status(), 'gas-fee-options must not return a 5xx error').toBeLessThan(500);
  });

  // ── [6] Page render ────────────────────────────────────────────────────────
  test('[6] Home page renders with title and connect button', async ({ page }) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await expect(page).toHaveTitle(/Stellar-Spend/i);
    await expect(
      page.getByRole('button', { name: /connect wallet/i }),
      'Connect Wallet button must be visible',
    ).toBeVisible();
  });

  // ── [7] No JS console errors ───────────────────────────────────────────────
  test('[7] Home page renders without JS console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30_000 });
    expect(errors, `Console errors detected:\n${errors.join('\n')}`).toHaveLength(0);
  });

  // ── [8] Service worker ─────────────────────────────────────────────────────
  test('[8] Service worker registers successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30_000 });
    const registered = await page.evaluate(() =>
      navigator.serviceWorker.getRegistrations().then((r) => r.length > 0),
    );
    expect(registered, 'service worker must be registered').toBe(true);
  });

  // ── Alert hook: fire on any test failure ───────────────────────────────────
  test.afterEach(async ({ request }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await alertOnFailure(request, testInfo.title, testInfo.error?.message ?? 'unknown error');
    }
  });
});

/**
 * SMOKE CHECKLIST
 * ─────────────────────────────────────────────────────────────────────────────
 * [1] /api/health              — server is reachable and reports healthy/degraded
 * [2] /api/offramp/currencies  — currency list is non-empty
 * [3] /api/offramp/rate        — live FX rate is positive
 * [4] /api/offramp/quote       — quote endpoint does not crash (502 OK in sandbox)
 * [5] /api/offramp/bridge/gas-fee-options — bridge options endpoint reachable
 * [6] Page title + connect button visible
 * [7] Zero JS console errors on load
 * [8] Service worker registered
 *
 * ALL 8 checks must pass for the blue-green gate to allow traffic switching.
 * Any failure triggers the SMOKE_ALERT_WEBHOOK (Slack/Discord) and causes the
 * deploy script to call `docker compose down` on the new slot.
 *
 * Environment variables:
 *   BASE_URL              — target deployment URL (default http://localhost:3001)
 *   SMOKE_BUDGET_MS       — hard timeout for full suite in ms (default 60000)
 *   SMOKE_ALERT_WEBHOOK   — Slack/Discord incoming webhook URL for alert POSTs
 */
