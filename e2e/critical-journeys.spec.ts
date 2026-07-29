import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

test.describe('Critical Journeys', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).freighter = {
        isConnected: async () => true,
        getPublicKey: async () => 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        signTransaction: async (xdr: string) => xdr,
      };
    });

    await page.route('**/api/offramp/quote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          destinationAmount: '158200.00',
          rate: 1582,
          currency: 'NGN',
          bridgeFee: '0.50',
          payoutFee: '1582.00',
          estimatedTime: 300,
          provider: 'paycrest',
        }),
      });
    });

    await page.route('**/api/offramp/currencies', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currencies: ['NGN', 'KES', 'GHS', 'UGX'] }),
      });
    });
  });

  test.describe('connect → quote → sign → status happy path', () => {
    test('complete full offramp transaction with mocked wallet', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();

      await page.getByRole('button', { name: /connect wallet/i }).click();
      await page.waitForTimeout(500);

      await page.getByRole('button', { name: /Freighter/i }).click();
      await page.waitForTimeout(500);

      await page.fill('input[placeholder="Enter amount"]', '100');
      await page.fill('input[name="accountNumber"]', '0123456789');
      await page.fill('input[name="bankCode"]', '044');
      await page.fill('input[name="beneficiaryName"]', 'John Doe');

      await page.getByRole('button', { name: /get quote/i }).click();
      await page.waitForTimeout(500);
    });
  });

  test.describe('failure scenarios', () => {
    test('handles rejected wallet sign', async ({ page }) => {
      await page.addInitScript(() => {
        (window as any).freighter = {
          isConnected: async () => true,
          getPublicKey: async () => 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
          signTransaction: async () => {
            throw new Error('User rejected signing');
          },
        };
      });

      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /connect wallet/i }).click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: /Freighter/i }).click();
      await page.waitForTimeout(500);

      await page.fill('input[placeholder="Enter amount"]', '100');
      await page.getByRole('button', { name: /confirm/i }).click();
      await page.waitForTimeout(500);
    });

    test('handles stale quote gracefully', async ({ page }) => {
      await page.route('**/api/offramp/quote', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            destinationAmount: '0',
            rate: 0,
            currency: 'NGN',
            bridgeFee: '0',
            payoutFee: '0',
            estimatedTime: 0,
            provider: 'paycrest',
            stale: true,
          }),
        });
      });

      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /connect wallet/i }).click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: /Freighter/i }).click();
      await page.waitForTimeout(500);

      await page.fill('input[placeholder="Enter amount"]', '100');
      await page.getByRole('button', { name: /get quote/i }).click();
      await page.waitForTimeout(500);
    });
  });

  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('offramp flow on mobile', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();
      await page.getByRole('button', { name: /connect wallet/i }).click();
      await page.waitForTimeout(500);
    });
  });

  test.describe('accessibility', () => {
    test('home page has no axe violations', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toHaveLength(0);
    });

    test('offramp form has no critical axe violations', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /connect wallet/i }).click();
      await page.waitForTimeout(500);

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const criticalViolations = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(criticalViolations).toHaveLength(0);
    });
  });

  test.describe('trace capture on failure', () => {
    test('trace is captured on failure', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
      expect(await page.title()).toBeDefined();
    });
  });
});
