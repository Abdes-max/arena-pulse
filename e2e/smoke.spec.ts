import { test, expect } from '@playwright/test';

test.describe('web', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('http://localhost:4200');
    await expect(page).toHaveTitle(/Arena Pulse/i);
  });

  test('unauthenticated access to /admin redirects to /login', async ({ page }) => {
    await page.goto('http://localhost:4200/admin/tournaments');
    await expect(page).toHaveURL(/\/login/);
  });
});
