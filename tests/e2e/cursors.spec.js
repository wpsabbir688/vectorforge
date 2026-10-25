// Tool cursors on the canvas SVG: every tool must show a cursor that fits
// what it does (drawing tools get a crosshair for precise placement, the
// eyedropper gets the standard picker cursor, the hand tool grabs).
import { test, expect } from '@playwright/test';
import { gotoSeeded } from './helpers.js';

async function canvasCursor(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="canvas-svg"]');
    return getComputedStyle(svg).cursor;
  });
}

async function selectTool(page, title) {
  await page.getByTitle(title, { exact: true }).click();
}

test('canvas cursor matches the active tool', async ({ page }) => {
  await gotoSeeded(page);
  const cases = [
    ['Select / Move (V)', 'default'],
    ['Rectangle (R)', 'crosshair'],
    ['Pen (P)', 'crosshair'],
    ['Text (T)', 'text'],
    ['Eyedropper', 'cell'],
    ['Hand (pan) (H)', 'grab'],
  ];
  for (const [title, cursor] of cases) {
    await selectTool(page, title);
    await expect.poll(() => canvasCursor(page)).toBe(cursor);
  }
});

test('hand tool shows grabbing while a pan drag is in progress', async ({ page }) => {
  await gotoSeeded(page);
  await selectTool(page, 'Hand (pan) (H)');
  await expect.poll(() => canvasCursor(page)).toBe('grab');
  const box = await page.locator('[data-testid="canvas-svg"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 5 });
  await expect.poll(() => canvasCursor(page)).toBe('grabbing');
  await page.mouse.up();
  await expect.poll(() => canvasCursor(page)).toBe('grab');
});
