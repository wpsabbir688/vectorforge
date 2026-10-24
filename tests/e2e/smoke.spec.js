import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

// Smoke test for the production build: the app must render (never a blank
// page), draw, recolor, and export. This is the test that would have caught
// the 2026-10-24 missing-import outage, where no test ever rendered the app.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Boot completes when the default logo template's layers appear.
  await expect(page.getByText('Badge star')).toBeVisible({ timeout: 15000 });
});

test('studio renders: toolbar, canvas, panels', async ({ page }) => {
  await expect(page.getByTitle('Rectangle (R)')).toBeVisible();
  await expect(page.locator('[data-testid="canvas-svg"]')).toBeVisible();
  await expect(page.getByText('Layers', { exact: true })).toBeVisible();
  await expect(page.getByText('Properties', { exact: true })).toBeVisible();
  // The default logo template renders real artwork, not an empty canvas.
  await expect(page.locator('[data-testid="canvas-svg"]').getByText('NOVA STUDIO')).toBeVisible();
});

test('draw a rectangle and change its fill', async ({ page }) => {
  await page.getByTitle('Rectangle (R)').click();
  const box = await page.locator('[data-testid="canvas-svg"]').boundingBox();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, { steps: 5 });
  await page.mouse.up();

  // The new layer appears and is selected.
  await expect(page.getByText('Rectangle', { exact: true })).toBeVisible();
  // Recolor via the Properties swatch and check the canvas rect itself.
  await page.getByTitle('#ef4444').first().click();
  await expect(page.locator('[data-testid="canvas-svg"] rect[fill="#ef4444"]')).toHaveCount(1);
});

test('export SVG downloads a valid file', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTitle('Export SVG').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
  const path = await download.path();
  const content = await fs.readFile(path, 'utf8');
  expect(content.startsWith('<svg')).toBe(true);
  expect(content).toContain('NOVA STUDIO');
});
