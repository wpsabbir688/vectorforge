import { test, expect } from '@playwright/test';
import { clickTopBarText } from './helpers.js';

// Phase 3 coverage: language toggle, first-run tour, and the component loop
// (create from selection, place an instance) — all through the real UI.
async function gotoSeeded(page) {
  await page.addInitScript(() => localStorage.setItem('vectorforge-tour-seen', '1'));
  await page.goto('/');
  await expect(page.getByText('Badge star')).toBeVisible({ timeout: 15000 });
}

test('language toggle switches panel chrome between English and Bengali', async ({ page }) => {
  await gotoSeeded(page);
  // The language toggle may sit in the More overflow menu (Phase 5).
  await clickTopBarText(page, 'BN');
  await expect(page.getByText('লেয়ার', { exact: true })).toBeVisible();
  await clickTopBarText(page, 'EN');
  await expect(page.getByText('Layers', { exact: true })).toBeVisible();
});

test('first-run tour shows once, skips, and remembers the choice', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('tour')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('tour-next').click();
  await expect(page.getByText('Tools', { exact: true })).toBeVisible();
  await page.getByTestId('tour-skip').click();
  await expect(page.getByTestId('tour')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('vectorforge-tour-seen'))).toBe('1');
  // A reload must not bring the tour back.
  await page.reload();
  await expect(page.getByTestId('tour')).toHaveCount(0);
});

// Touch: a touch-pointer drag must draw, proving canvas input is unified on
// Pointer Events rather than mouse-only handlers. (Playwright's touchscreen
// API has no multi-touch, so pinch-to-zoom itself is verified by code
// inspection + the pinch math in CanvasArea, not here.)
test('touch: touch-pointer drag draws a rectangle', async ({ page }) => {
  await gotoSeeded(page);
  await page.getByTitle('Rectangle (R)').click();
  const svg = page.locator('[data-testid="canvas-svg"]');
  const box = await svg.boundingBox();
  await page.evaluate(([x0, y0, x1, y1]) => {
    const el = document.querySelector('[data-testid="canvas-svg"]');
    const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch',
      isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      clientX: x, clientY: y,
    }));
    fire('pointerdown', x0, y0);
    for (let i = 1; i <= 5; i++) fire('pointermove', x0 + (x1 - x0) * i / 5, y0 + (y1 - y0) * i / 5);
    fire('pointerup', x1, y1);
  }, [box.x + 100, box.y + 100, box.x + 300, box.y + 250]);
  await expect(page.getByText('Rectangle', { exact: true })).toBeVisible();
});

test('components: create from a drawn rectangle, then place an instance', async ({ page }) => {
  await gotoSeeded(page);
  const svg = page.locator('[data-testid="canvas-svg"]');
  const box = await svg.boundingBox();
  await page.getByTitle('Rectangle (R)').click();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Create component' }).click();
  await expect(page.getByText('No components yet.')).toHaveCount(0);

  const rectsBefore = await svg.locator('rect').count();
  await page.getByRole('button', { name: 'Place', exact: true }).first().click();
  await expect.poll(async () => svg.locator('rect').count()).toBe(rectsBefore + 1);
});
