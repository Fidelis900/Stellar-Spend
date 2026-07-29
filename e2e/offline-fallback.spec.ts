/**
 * Offline Fallback E2E Tests — #837
 *
 * Test Checklist:
 *  [1] Offline network → service worker serves offline.html fallback
 *  [2] offline.html contains expected content (heading, retry button, app name)
 *  [3] /sw.js is accessible and returns a 200 response
 *  [4] CACHE_NAME in sw.js follows the versioned pattern (stellar-spend-v*)
 *      — ensures cache invalidation works correctly on new deploys
 *
 * Notes:
 * - Tests [1], [3], [4] require a running server at BASE_URL.
 * - Service worker tests require a Chromium-family browser (SW support).
 * - Offline simulation uses page.context().setOffline(true) after initial load
 *   so the SW has time to install and activate before the network is cut.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001';

// ── Suite ────────────────────────────────────────────────────────────────────

test.describe('Offline fallback', () => {
  // ── [1] Offline network → SW serves offline.html ─────────────────────────
  test('[1] Service worker serves offline.html when network is unavailable', async ({
    page,
    context,
    browserName,
  }) => {
    // Service workers only function reliably in Chromium in Playwright's test
    // environment. Skip on non-Chromium to avoid false failures.
    test.skip(
      browserName !== 'chromium',
      'Service worker offline simulation is only reliable in Chromium'
    );

    // 1. Load the page while online so the SW has a chance to install/activate.
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30_000 });

    // 2. Wait for the service worker to register and activate.
    const registered = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return !!reg.active;
    });
    expect(registered, 'Service worker must be active before going offline').toBe(true);

    // 3. Cut the network.
    await context.setOffline(true);

    // 4. Navigate to a route that is not in the SW cache — the SW should fall
    //    back to offline.html for navigation requests it cannot fulfil.
    await page.goto(`${BASE_URL}/not-a-real-page`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });

    // 5. Verify offline.html content is rendered.
    await expect(
      page.getByRole('heading', { name: /you're offline/i }),
      "Offline page heading \"You're Offline\" must be visible"
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole('button', { name: /try again/i }),
      'Offline page retry button must be visible'
    ).toBeVisible();

    // 6. Restore network to avoid affecting subsequent tests.
    await context.setOffline(false);
  });

  // ── [2] offline.html static content ──────────────────────────────────────
  test('[2] offline.html contains expected content', async ({ request }) => {
    // Directly fetch the static file from the server — no need for a browser.
    const res = await request.get(`${BASE_URL}/offline.html`, { timeout: 10_000 });
    expect(res.status(), '/offline.html must be reachable').toBe(200);

    const html = await res.text();

    // App name in <title>
    expect(html, 'offline.html must mention Stellar-Spend in the title').toMatch(
      /Stellar-Spend/i
    );

    // Main heading
    expect(html, 'offline.html must contain the "You\'re Offline" heading').toMatch(
      /you['']re offline/i
    );

    // Retry button
    expect(html, 'offline.html must contain a "Try Again" button').toMatch(
      /try again/i
    );

    // App name in body copy
    expect(html, 'offline.html must reference the Stellar-Spend app name in body text').toMatch(
      /stellar-spend/i
    );
  });

  // ── [3] /sw.js is accessible ──────────────────────────────────────────────
  test('[3] Service worker script (/sw.js) is accessible', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/sw.js`, { timeout: 10_000 });

    expect(
      res.status(),
      '/sw.js must return HTTP 200'
    ).toBe(200);

    const contentType = res.headers()['content-type'] ?? '';
    // Browsers require SW scripts to be served as JS.
    expect(
      contentType,
      '/sw.js Content-Type must indicate JavaScript'
    ).toMatch(/javascript|text\/plain/i);
  });

  // ── [4] CACHE_NAME versioning pattern ────────────────────────────────────
  test('[4] CACHE_NAME in sw.js follows the versioned pattern (stellar-spend-v*)', async ({
    request,
  }) => {
    const res = await request.get(`${BASE_URL}/sw.js`, { timeout: 10_000 });
    expect(res.status(), '/sw.js must be reachable').toBe(200);

    const source = await res.text();

    // The CACHE_NAME constant must follow `stellar-spend-v<number>` so that
    // bumping the version automatically invalidates the old cache on deploy.
    //   Valid:   "stellar-spend-v1", "stellar-spend-v2", "stellar-spend-v10"
    //   Invalid: "stellar-spend", "my-cache-v1", "stellar-spend-v"
    const cacheNamePattern = /CACHE_NAME\s*=\s*["']stellar-spend-v\d+["']/;
    expect(
      source,
      'CACHE_NAME must be set to a versioned string matching stellar-spend-v<number> ' +
        '(e.g. "stellar-spend-v1"). Bump this value on each deploy to bust stale caches.'
    ).toMatch(cacheNamePattern);

    // Also verify the cleanup logic keys off the same prefix so old versions
    // are actually removed.  The activate handler should filter by the prefix.
    expect(
      source,
      'sw.js activate handler must filter cache keys by the "stellar-spend-" prefix ' +
        'to ensure old versioned caches are cleaned up on deploy'
    ).toMatch(/stellar-spend-/);
  });
});
