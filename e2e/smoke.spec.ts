import { test, expect } from '@playwright/test';

test.describe('public-web', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('http://localhost:4200');
    await expect(page).toHaveTitle(/PublicWeb/i);
  });
});

test.describe('admin-web', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('http://localhost:4300');
    await expect(page).toHaveTitle(/AdminWeb/i);
  });
});
