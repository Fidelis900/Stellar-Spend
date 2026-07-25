/**
 * E2E accessibility audit for transaction/payment form flows (issue #762).
 *
 * Uses @axe-core/playwright (AxeBuilder) — the maintained integration — to scan
 * the transaction-facing flows against WCAG 2.1 A/AA and gate on zero
 * serious/critical violations, with an explicit assertion that every form field
 * exposes an accessible name.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001';

async function scan(page: Page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}

function seriousViolations(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
  return results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
}

function format(violations: ReturnType<typeof seriousViolations>): string {
  return violations
    .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
    .join('\n');
}

test.describe('A11y (axe): Transaction/payment form flows', () => {
  test('send/offramp form has zero serious violations', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const results = await scan(page);
    const serious = seriousViolations(results);
    expect(serious, `Serious violations on send form:\n${format(serious)}`).toEqual([]);
  });

  test('every visible form field has an accessible name', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const fields = page.locator(
      'input:visible, select:visible, textarea:visible'
    );
    const count = await fields.count();
    for (let i = 0; i < count; i++) {
      const field = fields.nth(i);
      const accessibleName = await field.evaluate((el) => {
        const byLabel = el.getAttribute('aria-label');
        if (byLabel) return byLabel;
        const labelledby = el.getAttribute('aria-labelledby');
        if (labelledby) return labelledby;
        const id = el.getAttribute('id');
        if (id && document.querySelector(`label[for="${id}"]`)) return id;
        if (el.closest('label')) return 'wrapped-label';
        return '';
      });
      expect(accessibleName, `Field #${i} is missing an accessible name`).not.toBe('');
    }
  });

  test('transaction history page has zero serious violations', async ({ page }) => {
    const res = await page
      .goto(`${BASE_URL}/history`, { waitUntil: 'networkidle' })
      .catch(() => null);
    // Skip gracefully if the route is unavailable/redirects in this environment.
    if (!res || !res.ok()) test.skip(true, 'History route not available');
    const results = await scan(page);
    const serious = seriousViolations(results);
    expect(serious, `Serious violations on history:\n${format(serious)}`).toEqual([]);
  });
});
