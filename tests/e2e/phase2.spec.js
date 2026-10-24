import { test, expect } from '@playwright/test';

// Phase 2 coverage: multi-artboard switching and a boolean operation,
// driven through the real UI (mouse + buttons), not store internals.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Badge star')).toBeVisible({ timeout: 15000 });
});

test('multi-artboard: add, switch to an empty board, switch back', async ({ page }) => {
  const select = page.locator('[data-testid="artboard-select"]');
  await expect(select.locator('option')).toHaveCount(1);
  // The logo template is visible on the first artboard.
  await expect(page.locator('[data-testid="canvas-svg"]').getByText('NOVA STUDIO')).toBeVisible();

  await page.getByTitle('Add artboard').click();
  await expect(select.locator('option')).toHaveCount(2);
  // The new artboard is active and empty: the logo text is gone.
  await expect(page.locator('[data-testid="canvas-svg"]').getByText('NOVA STUDIO')).toHaveCount(0);

  // Switch back to the first artboard: the logo returns.
  await select.selectOption({ index: 0 });
  await expect(page.locator('[data-testid="canvas-svg"]').getByText('NOVA STUDIO')).toBeVisible();
});

test('boolean unite merges two overlapping rectangles', async ({ page }) => {
  const svg = page.locator('[data-testid="canvas-svg"]');
  const box = await svg.boundingBox();
  await page.getByTitle('Rectangle (R)').click();
  // Two overlapping rectangles, drawn in an empty corner of the canvas.
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, { steps: 5 });
  await page.mouse.up();
  await page.mouse.move(box.x + 200, box.y + 180);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + 330, { steps: 5 });
  await page.mouse.up();

  // Marquee-select both rectangles with the Select tool.
  await page.getByTitle('Select / Move (V)').click();
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 450, box.y + 380, { steps: 5 });
  await page.mouse.up();

  await page.getByTitle('Unite — merge selected shapes into one').click();
  // The two rectangles are replaced by a single boolean result layer.
  await expect(page.getByText('Boolean result')).toBeVisible();
});
