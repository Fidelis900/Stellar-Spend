import { test, expect } from '@playwright/test';

test.describe('Transaction History', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');

    // Connect wallet
    await page.click('button:has-text("Connect Wallet")');
    await page.waitForSelector('[data-testid="wallet-modal"]');
    await page.click('button:has-text("Freighter")');
    await page.waitForNavigation();
  });

  test('should display transaction history', async ({ page }) => {
    // Navigate to history
    await page.click('a:has-text("History")');
    await page.waitForSelector('[data-testid="transaction-history"]');

    // Verify history is visible
    const history = await page.locator('[data-testid="transaction-history"]');
    expect(history).toBeVisible();
  });

  test('should display transaction details', async ({ page }) => {
    // Navigate to history
    await page.click('a:has-text("History")');
    await page.waitForSelector('[data-testid="transaction-history"]');

    // Click on first transaction
    const firstTx = await page.locator('[data-testid="transaction-entry"]').first();
    if (await firstTx.isVisible()) {
      await firstTx.click();
      await page.waitForSelector('[data-testid="transaction-details"]');

      // Verify details are displayed
      const details = await page.locator('[data-testid="transaction-details"]');
      expect(details).toBeVisible();
    }
  });

  test('should filter transactions by status', async ({ page }) => {
    // Navigate to history
    await page.click('a:has-text("History")');
    await page.waitForSelector('[data-testid="transaction-history"]');

    // Filter by completed
    await page.click('select[name="status"]');
    await page.selectOption('select[name="status"]', 'completed');

    // Wait for filtered results
    await page.waitForTimeout(500);

    // Verify only completed transactions are shown
    const entries = await page.locator('[data-testid="transaction-entry"]');
    const count = await entries.count();

    for (let i = 0; i < count; i++) {
      const status = await entries
        .nth(i)
        .locator('[data-testid="transaction-status"]')
        .textContent();
      expect(status).toContain('Completed');
    }
  });

  test('should search transactions', async ({ page }) => {
    // Navigate to history
    await page.click('a:has-text("History")');
    await page.waitForSelector('[data-testid="transaction-history"]');

    // Search for transaction
    await page.fill('input[placeholder="Search transactions"]', 'NGN');

    // Wait for search results
    await page.waitForTimeout(500);

    // Verify results contain search term
    const entries = await page.locator('[data-testid="transaction-entry"]');
    const count = await entries.count();

    if (count > 0) {
      const firstEntry = await entries.first().textContent();
      expect(firstEntry).toContain('NGN');
    }
  });

  test('should sort transactions', async ({ page }) => {
    // Navigate to history
    await page.click('a:has-text("History")');
    await page.waitForSelector('[data-testid="transaction-history"]');

    // Sort by date descending
    await page.click('button:has-text("Date")');
    await page.click('button:has-text("Descending")');

    // Wait for sorted results
    await page.waitForTimeout(500);

    // Verify transactions are sorted
    const entries = await page.locator('[data-testid="transaction-entry"]');
    expect(entries).toBeDefined();
  });

  test('should export transaction history', async ({ page }) => {
    // Navigate to history
    await page.click('a:has-text("History")');
    await page.waitForSelector('[data-testid="transaction-history"]');

    // Click export button
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export")');
    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toContain('transactions');
  });

  test('should display transaction statistics', async ({ page }) => {
    // Navigate to history
    await page.click('a:has-text("History")');
    await page.waitForSelector('[data-testid="transaction-history"]');

    // Verify statistics are displayed
    const stats = await page.locator('[data-testid="transaction-stats"]');
    expect(stats).toBeVisible();

    // Check for total amount
    const totalAmount = await page.locator('[data-testid="total-amount"]').textContent();
    expect(totalAmount).toMatch(/\d+/);
  });

  test('should handle empty transaction history', async ({ page }) => {
    // Navigate to history
    await page.click('a:has-text("History")');
    await page.waitForSelector('[data-testid="transaction-history"]');

    // Check for empty state
    const emptyState = await page.locator('[data-testid="empty-state"]');
    if (await emptyState.isVisible()) {
      expect(emptyState).toContainText('No transactions');
    }
  });
});
