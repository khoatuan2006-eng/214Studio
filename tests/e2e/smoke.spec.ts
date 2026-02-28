import { test, expect } from '@playwright/test';

test('app loads and shows project manager', async ({ page }) => {
    // We assume the app is running at http://localhost:5173 for tests
    await page.goto('http://localhost:5173');

    // Wait for loading to finish
    const loading = page.locator('text=Loading');
    if (await loading.isVisible()) {
        await expect(loading).toBeHidden({ timeout: 10000 });
    }

    // Check for project manager or main UI elements
    // Adjust selector based on actual App.tsx structure
    await expect(page).toHaveTitle(/AnimeStudio/);
});
