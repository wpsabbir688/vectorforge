// Phase 5 coverage: responsive header + mobile drawers, command palette,
// recent files, layer search, zoom to selection, custom canvas size.
import { test, expect } from '@playwright/test';
import { clickTopBarTitle, gotoSeeded } from './helpers.js';

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(overflow.doc).toBeLessThanOrEqual(overflow.inner);
  expect(overflow.body).toBeLessThanOrEqual(overflow.inner);
}

test('mobile 390px: no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSeeded(page);
  await assertNoHorizontalOverflow(page);
});

test('mobile 320px: no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await gotoSeeded(page);
  await assertNoHorizontalOverflow(page);
});

test('mobile 390px: More menu opens and an overflowed action works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSeeded(page);
  // At phone width most actions overflow; the More button must exist.
  await page.getByTestId('topbar-more').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTitle('Export SVG').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
});

test('mobile 390px: Layers and Properties drawers toggle open and closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSeeded(page);
  // Panels start closed on phones: no layer search input, no sheet.
  await expect(page.getByPlaceholder('Search layers…')).toHaveCount(0);

  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(page.getByPlaceholder('Search layers…')).toBeVisible();
  await page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: '✕' }).click();
  await expect(page.getByPlaceholder('Search layers…')).toHaveCount(0);

  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(page.locator('.fixed.inset-x-0.bottom-0')).toBeVisible();
  await expect(page.getByText('Fill', { exact: true }).first()).toBeVisible();
  await page.locator('.fixed.inset-x-0.bottom-0 button', { hasText: '✕' }).click();
  await expect(page.locator('.fixed.inset-x-0.bottom-0')).toHaveCount(0);
});

test('mobile 390px: drawing still works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSeeded(page);
  await page.getByTitle('Rectangle (R)').click();
  const box = await page.locator('[data-testid="canvas-svg"]').boundingBox();
  await page.mouse.move(box.x + 60, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 180, { steps: 5 });
  await page.mouse.up();
  // Open the Layers drawer to confirm the new layer exists.
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(page.getByText('Rectangle', { exact: true })).toBeVisible();
});

test('command palette: Ctrl/Cmd+K opens, search runs a real action, Esc closes', async ({ page }) => {
  await gotoSeeded(page);
  await page.keyboard.press('Control+K');
  await expect(page.getByPlaceholder('Search actions…')).toBeVisible();
  await page.getByPlaceholder('Search actions…').fill('shortcuts');
  await page.getByRole('button', { name: /Show shortcuts/ }).click();
  await expect(page.getByText('Keyboard shortcuts', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Keyboard shortcuts', { exact: true })).toHaveCount(0);

  // Esc closes the palette itself.
  await page.keyboard.press('Control+K');
  await expect(page.getByPlaceholder('Search actions…')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByPlaceholder('Search actions…')).toHaveCount(0);
});

test('recent files: save, new, reopen restores the document', async ({ page }) => {
  await gotoSeeded(page);
  // Save the logo document (records a Recent entry named Untitled).
  await clickTopBarTitle(page, 'Save as JSON');
  // New document (accept the confirm), then reopen from Recent.
  page.on('dialog', (d) => d.accept());
  await clickTopBarTitle(page, 'New document');
  await expect(page.locator('[data-testid="canvas-svg"]').getByText('NOVA STUDIO')).toHaveCount(0);
  await page.getByTitle('Recent files').click();
  await page.getByRole('button', { name: /Untitled/ }).first().click();
  await expect(page.locator('[data-testid="canvas-svg"]').getByText('NOVA STUDIO')).toBeVisible();
});

test('layer search: filters the list, shows an honest empty state, clears', async ({ page }) => {
  await gotoSeeded(page);
  const search = page.getByPlaceholder('Search layers…');
  await expect(search).toBeVisible();
  await search.fill('star');
  await expect(page.getByText('Badge star')).toBeVisible();
  await expect(page.getByText(/No layers match/)).toHaveCount(0);
  await search.fill('zzzz-no-such-layer');
  await expect(page.getByText(/No layers match/)).toBeVisible();
  await page.getByTitle('Clear search').click();
  await expect(page.getByText('Badge star')).toBeVisible();
  await expect(page.getByText(/No layers match/)).toHaveCount(0);
});

test('zoom to selection: F fits the view to a small selection', async ({ page }) => {
  await gotoSeeded(page);
  await page.getByTitle('Rectangle (R)').click();
  const box = await page.locator('[data-testid="canvas-svg"]').boundingBox();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 190, { steps: 5 });
  await page.mouse.up();
  const before = await page.getByText(/Zoom: \d+%/, { exact: false }).textContent();
  await page.keyboard.press('f');
  const after = await page.getByText(/Zoom: \d+%/, { exact: false }).textContent();
  expect(after).not.toBe(before);
});

test('custom canvas size: resize dialog changes artboard dimensions', async ({ page }) => {
  await gotoSeeded(page);
  const select = page.locator('[data-testid="artboard-select"]');
  await clickTopBarTitle(page, 'Resize artboard');
  await expect(page.getByRole('dialog', { name: 'Resize artboard' })).toBeVisible();
  await page.getByLabel('Width').fill('800');
  await page.getByLabel('Height').fill('600');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(select.locator('option:checked')).toContainText('800×600');
  const rect = page.locator('[data-testid="canvas-svg"] rect[stroke="#555"]');
  await expect(rect).toHaveAttribute('width', '800');
  await expect(rect).toHaveAttribute('height', '600');
});

test('custom canvas size: new artboard dialog offers a custom size', async ({ page }) => {
  await gotoSeeded(page);
  const select = page.locator('[data-testid="artboard-select"]');
  await expect(select.locator('option')).toHaveCount(1);
  await clickTopBarTitle(page, 'Add artboard');
  await expect(page.getByRole('dialog', { name: 'New artboard size' })).toBeVisible();
  await page.getByLabel('Width').fill('400');
  await page.getByLabel('Height').fill('300');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(select.locator('option')).toHaveCount(2);
  await expect(select.locator('option:checked')).toContainText('400×300');
});
