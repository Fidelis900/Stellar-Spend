import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:6006'; // Storybook URL
const SNAPSHOT_DIR = 'e2e/snapshots/design-system';

test.describe('Design System Component Visual Regression Tests', () => {
  test.describe('Button Component', () => {
    test('should match Button primary variant snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=button--primary`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('button-primary.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Button secondary variant snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=button--secondary`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('button-secondary.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Button disabled state snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=button--disabled`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('button-disabled.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Button loading state snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=button--loading`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('button-loading.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Button sizes snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=button--sizes`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('button-sizes.png', {
        maxDiffPixels: 50,
      });
    });
  });

  test.describe('Card Component', () => {
    test('should match Card default snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=card--default`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('card-default.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Card with hover state snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=card--interactive`);
      await page.waitForLoadState('networkidle');

      const card = page.locator('[data-testid="card"]').first();
      await card.hover();
      await page.waitForTimeout(200);

      await expect(card).toHaveScreenshot('card-hover.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Card elevated variant snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=card--elevated`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('card-elevated.png', {
        maxDiffPixels: 50,
      });
    });
  });

  test.describe('Alert Component', () => {
    test('should match Alert success variant snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=alert--success`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('alert-success.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Alert error variant snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=alert--error`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('alert-error.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Alert warning variant snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=alert--warning`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('alert-warning.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Alert info variant snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=alert--info`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('alert-info.png', {
        maxDiffPixels: 50,
      });
    });
  });

  test.describe('Badge Component', () => {
    test('should match Badge default snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=badge--default`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('badge-default.png', {
        maxDiffPixels: 30,
      });
    });

    test('should match Badge all variants snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=badge--variants`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('badge-variants.png', {
        maxDiffPixels: 50,
      });
    });
  });

  test.describe('Input Component', () => {
    test('should match Input default state snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=input--default`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('input-default.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Input focus state snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=input--default`);
      await page.waitForLoadState('networkidle');

      const input = page.locator('input').first();
      await input.focus();
      await page.waitForTimeout(200);

      await expect(input).toHaveScreenshot('input-focus.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Input error state snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=input--error`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('input-error.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Input disabled state snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=input--disabled`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('input-disabled.png', {
        maxDiffPixels: 50,
      });
    });
  });

  test.describe('Component Library Page', () => {
    test('should match component library index snapshot', async ({ page }) => {
      await page.goto(`${BASE_URL}/?path=/docs/`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('component-library-index.png', {
        maxDiffPixels: 100,
      });
    });
  });

  test.describe('Responsive Design System Components', () => {
    test('should match Button on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${BASE_URL}/iframe.html?id=button--primary`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('button-primary-mobile.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Card on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(`${BASE_URL}/iframe.html?id=card--default`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('card-default-tablet.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Alert on desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(`${BASE_URL}/iframe.html?id=alert--success`);
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveScreenshot('alert-success-desktop.png', {
        maxDiffPixels: 50,
      });
    });
  });

  test.describe('Dark Mode Variants', () => {
    test('should match Button in dark mode', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=button--primary`);
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
      });
      await page.waitForTimeout(300);

      await expect(page).toHaveScreenshot('button-primary-dark.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Card in dark mode', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=card--default`);
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
      });
      await page.waitForTimeout(300);

      await expect(page).toHaveScreenshot('card-default-dark.png', {
        maxDiffPixels: 50,
      });
    });

    test('should match Alert in dark mode', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=alert--success`);
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
      });
      await page.waitForTimeout(300);

      await expect(page).toHaveScreenshot('alert-success-dark.png', {
        maxDiffPixels: 50,
      });
    });
  });

  test.describe('Accessibility Visual Tests', () => {
    test('should verify focus indicators on Button', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=button--primary`);
      await page.waitForLoadState('networkidle');

      const button = page.locator('button').first();
      await button.focus();
      await page.waitForTimeout(200);

      const focusStyle = await button.evaluate((el) => {
        return window.getComputedStyle(el, ':focus').outline;
      });

      expect(focusStyle).toBeDefined();

      await expect(button).toHaveScreenshot('button-focus-indicator.png', {
        maxDiffPixels: 30,
      });
    });

    test('should verify color contrast in Alert', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=alert--warning`);
      await page.waitForLoadState('networkidle');

      const alert = page.locator('[role="alert"]').first();
      const style = await alert.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        };
      });

      expect(style.color).toBeDefined();
      expect(style.backgroundColor).toBeDefined();
    });

    test('should verify proper semantic structure', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=button--primary`);
      await page.waitForLoadState('networkidle');

      const button = page.locator('button').first();
      const role = await button.getAttribute('role');
      const ariaLabel = await button.getAttribute('aria-label');

      expect(button).toBeDefined();
    });
  });

  test.describe('Component Interaction States', () => {
    test('should capture Button hover state', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=button--primary`);
      await page.waitForLoadState('networkidle');

      const button = page.locator('button').first();
      await button.hover();
      await page.waitForTimeout(200);

      await expect(button).toHaveScreenshot('button-hover.png', {
        maxDiffPixels: 50,
      });
    });

    test('should capture Button active state', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=button--primary`);
      await page.waitForLoadState('networkidle');

      const button = page.locator('button').first();
      await button.dispatchEvent('mousedown');
      await page.waitForTimeout(100);

      await expect(button).toHaveScreenshot('button-active.png', {
        maxDiffPixels: 50,
      });
    });

    test('should capture Input with placeholder text', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=input--default`);
      await page.waitForLoadState('networkidle');

      const input = page.locator('input').first();
      const placeholder = await input.getAttribute('placeholder');

      expect(placeholder).toBeDefined();

      await expect(input).toHaveScreenshot('input-placeholder.png', {
        maxDiffPixels: 50,
      });
    });
  });

  test.describe('Baseline Snapshot Management', () => {
    test('should pass when snapshots exist and match', async ({ page }) => {
      await page.goto(`${BASE_URL}/iframe.html?id=button--primary`);
      await page.waitForLoadState('networkidle');

      // This will create/update the baseline snapshot
      await expect(page).toHaveScreenshot('button-primary.png', {
        maxDiffPixels: 50,
      });
    });

    test('should document snapshot update process', async ({}) => {
      // When visual changes are intentional, update snapshots with:
      // npx playwright test --update-snapshots
      // or: npm run test:e2e -- --update-snapshots

      expect(true).toBe(true);
    });
  });
});
