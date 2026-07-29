import { test, expect } from '@playwright/test';

test.describe('Complete Offramp Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');
  });

  test('should complete full offramp transaction', async ({ page }) => {
    // Step 1: Connect wallet
    await page.click('button:has-text("Connect Wallet")');
    await page.waitForSelector('[data-testid="wallet-modal"]');

    // Select Freighter
    await page.click('button:has-text("Freighter")');
    await page.waitForNavigation();

    // Step 2: Enter amount
    await page.fill('input[placeholder="Enter amount"]', '100');

    // Step 3: Select currency
    await page.click('select[name="currency"]');
    await page.selectOption('select[name="currency"]', 'NGN');

    // Step 4: Select fee method
    await page.click('input[value="USDC"]');

    // Step 5: Get quote
    await page.click('button:has-text("Get Quote")');
    await page.waitForSelector('[data-testid="quote-result"]');

    // Verify quote is displayed
    const quote = await page.locator('[data-testid="quote-result"]').textContent();
    expect(quote).toContain('NGN');

    // Step 6: Enter beneficiary details
    await page.fill('input[name="accountNumber"]', '1234567890');
    await page.fill('input[name="bankCode"]', '044');
    await page.fill('input[name="beneficiaryName"]', 'John Doe');

    // Step 7: Verify account
    await page.click('button:has-text("Verify Account")');
    await page.waitForSelector('[data-testid="verification-result"]');

    // Step 8: Review transaction
    await page.click('button:has-text("Review")');
    await page.waitForSelector('[data-testid="transaction-preview"]');

    // Step 9: Confirm transaction
    await page.click('button:has-text("Confirm")');

    // Wait for transaction to be submitted
    await page.waitForSelector('[data-testid="transaction-submitted"]');

    // Verify success message
    const successMessage = await page.locator('[data-testid="success-message"]').textContent();
    expect(successMessage).toContain('Transaction submitted');
  });

  test('should handle transaction with error recovery', async ({ page }) => {
    // Step 1: Connect wallet
    await page.click('button:has-text("Connect Wallet")');
    await page.waitForSelector('[data-testid="wallet-modal"]');
    await page.click('button:has-text("Freighter")');
    await page.waitForNavigation();

    // Step 2: Enter invalid amount first
    await page.fill('input[placeholder="Enter amount"]', '-100');
    await page.click('button:has-text("Get Quote")');

    // Should show error
    const error = await page.locator('[data-testid="error-message"]').textContent();
    expect(error).toContain('Invalid amount');

    // Step 3: Correct the amount
    await page.fill('input[placeholder="Enter amount"]', '100');
    await page.click('button:has-text("Get Quote")');

    // Should now succeed
    await page.waitForSelector('[data-testid="quote-result"]');
    const quote = await page.locator('[data-testid="quote-result"]').textContent();
    expect(quote).toBeDefined();
  });

  test('should display transaction history', async ({ page }) => {
    // Navigate to history page
    await page.click('a:has-text("History")');
    await page.waitForSelector('[data-testid="transaction-history"]');

    // Verify history is displayed
    const history = await page.locator('[data-testid="transaction-history"]');
    expect(history).toBeVisible();

    // Check for transaction entries
    const entries = await page.locator('[data-testid="transaction-entry"]').count();
    expect(entries).toBeGreaterThanOrEqual(0);
  });

  test('should handle wallet disconnection', async ({ page }) => {
    // Connect wallet
    await page.click('button:has-text("Connect Wallet")');
    await page.waitForSelector('[data-testid="wallet-modal"]');
    await page.click('button:has-text("Freighter")');
    await page.waitForNavigation();

    // Verify connected state
    const walletButton = await page.locator('[data-testid="wallet-button"]');
    expect(walletButton).toContainText('Connected');

    // Disconnect wallet
    await page.click('[data-testid="wallet-button"]');
    await page.click('button:has-text("Disconnect")');

    // Verify disconnected state
    const connectButton = await page.locator('button:has-text("Connect Wallet")');
    expect(connectButton).toBeVisible();
  });

  test('should validate beneficiary account', async ({ page }) => {
    // Connect wallet
    await page.click('button:has-text("Connect Wallet")');
    await page.waitForSelector('[data-testid="wallet-modal"]');
    await page.click('button:has-text("Freighter")');
    await page.waitForNavigation();

    // Enter invalid account number
    await page.fill('input[name="accountNumber"]', 'invalid');
    await page.click('button:has-text("Verify Account")');

    // Should show error
    const error = await page.locator('[data-testid="error-message"]').textContent();
    expect(error).toContain('Invalid account');

    // Enter valid account number
    await page.fill('input[name="accountNumber"]', '1234567890');
    await page.click('button:has-text("Verify Account")');

    // Should succeed
    await page.waitForSelector('[data-testid="verification-result"]');
  });
});
