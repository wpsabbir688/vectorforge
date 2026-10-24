// Phase 4 export specs: EPS and PDF downloads from the top bar.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { clickTopBarTitle } from './helpers.js';

test.beforeEach(async ({ page }) => {
  // Skip the onboarding tour so the studio is immediately usable.
  await page.addInitScript(() => {
    localStorage.setItem('vectorforge-tour-seen', '1');
  });
  await page.goto('/');
  // Boot completes when the default logo template's layers appear.
  await expect(page.getByText('Badge star')).toBeVisible({ timeout: 15000 });
});

test('Export EPS downloads a valid EPS file', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await clickTopBarTitle(page, 'Export EPS');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.eps$/);
  const path = await download.path();
  const text = fs.readFileSync(path, 'utf8');
  expect(text.startsWith('%!PS-Adobe-3.0 EPSF-3.0')).toBe(true);
  expect(text).toContain('%%BoundingBox');
});

test('Export PDF downloads a valid PDF file', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await clickTopBarTitle(page, 'Export PDF');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const path = await download.path();
  const text = fs.readFileSync(path, 'utf8');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text).toContain('/MediaBox');
});
