import { expect } from '@playwright/test';

// Shared E2E helpers (Phase 5). The responsive top bar moves lower-priority
// actions into a "More" overflow menu when the bar is narrower than its
// content — including at the default 1280px viewport. These helpers click
// a top-bar action whether it is visible in the bar or inside the overflow
// menu. The hidden measurement row carries no titles or accessible names,
// so it can never match these locators.

// Click a top-bar button by its title attribute.
export async function clickTopBarTitle(page, title) {
  const btn = page.getByTitle(title, { exact: true });
  if (await btn.isVisible()) { await btn.click(); return; }
  await page.getByTestId('topbar-more').click();
  await btn.click();
}

// Click a top-bar button by its accessible name (e.g. the BN/EN toggle).
// The More button is located by testid, not its title, because the title
// is translated — after a BN switch it is no longer 'More actions'.
export async function clickTopBarText(page, name) {
  const btn = page.getByRole('button', { name, exact: true });
  if (await btn.first().isVisible()) { await btn.first().click(); return; }
  await page.getByTestId('topbar-more').click();
  await btn.first().click();
}

// Boot the studio with the tour already seen, waiting for the default
// logo template's artwork on the canvas (works at any viewport, including
// phones where the Layers panel starts closed).
export async function gotoSeeded(page) {
  await page.addInitScript(() => localStorage.setItem('vectorforge-tour-seen', '1'));
  await page.goto('/');
  await expect(page.locator('[data-testid="canvas-svg"]').getByText('NOVA STUDIO')).toBeVisible({ timeout: 15000 });
}
