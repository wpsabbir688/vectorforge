// Round A Image Trace coverage: worker trace + insert, presets, compare
// view, cancel, WebP input. The modal is scoped via its fixed overlay so
// the top-bar "Trace" button never collides with the modal's run button.
import { test, expect } from '@playwright/test';
import { gotoSeeded, clickTopBarText } from './helpers.js';
import path from 'node:path';

const PNG = path.resolve('tests/e2e/assets/trace-test.png');
const WEBP = path.resolve('tests/e2e/assets/trace-test.webp');

function modal(page) {
  return page.locator('div.fixed.inset-0.z-50');
}

async function openTraceModal(page, file) {
  await gotoSeeded(page);
  await clickTopBarText(page, 'Trace');
  await expect(modal(page).getByText('Image Trace')).toBeVisible();
  if (file) {
    await modal(page).locator('input[type="file"]').setInputFiles(file);
  }
}

async function runTrace(page) {
  await modal(page).getByRole('button', { name: 'Trace', exact: true }).click();
  await expect(modal(page).getByTestId('trace-compare')).toBeVisible({ timeout: 20000 });
}

test('trace via worker completes, shows compare, inserts a Traced image group', async ({ page }) => {
  await openTraceModal(page, PNG);
  await runTrace(page);
  // The trace ran off-thread (worker), not the main-thread fallback.
  await expect(modal(page).getByText('(traced in background worker)')).toBeVisible();
  // Compare slider moves the divider.
  await modal(page).getByTestId('trace-compare-slider').fill('75');
  await expect(modal(page).getByTestId('trace-compare-slider')).toHaveValue('75');
  await modal(page).getByRole('button', { name: 'Add to canvas' }).click();
  await expect(page.getByText('Traced image', { exact: true })).toBeVisible();
});

test('preset selection fills the controls', async ({ page }) => {
  await openTraceModal(page, PNG);
  await modal(page).getByTestId('trace-preset').selectOption('logo');
  await expect(modal(page).getByTestId('trace-colors')).toHaveValue('6');
  await expect(modal(page).getByTestId('trace-detail')).toHaveValue('70');
  await modal(page).getByTestId('trace-preset').selectOption('sketch');
  await expect(modal(page).getByTestId('trace-mode')).toHaveValue('bw');
  await expect(modal(page).getByTestId('trace-adaptive')).toBeChecked();
});

test('quality select changes the downscale note', async ({ page }) => {
  await openTraceModal(page, PNG);
  await expect(modal(page).getByText('downscaled to 1024px')).toBeVisible();
  await modal(page).getByTestId('trace-quality').selectOption('high');
  await expect(modal(page).getByText('downscaled to 2048px')).toBeVisible();
});

test('cancel aborts a trace without inserting anything', async ({ page }) => {
  // E2E hook: the worker awaits this delay before tracing, so Cancel can
  // deterministically win the race.
  await page.addInitScript(() => { window.__VF_TRACE_DELAY_MS = 20000; });
  await openTraceModal(page, PNG);
  await modal(page).getByRole('button', { name: 'Trace', exact: true }).click();
  await expect(modal(page).getByTestId('trace-cancel-trace')).toBeVisible();
  // The UI must stay responsive while the worker is busy: controls work.
  await modal(page).getByTestId('trace-preset').selectOption('photo');
  await modal(page).getByTestId('trace-cancel-trace').click();
  await expect(modal(page).getByTestId('trace-cancel-trace')).toHaveCount(0);
  await expect(modal(page).getByRole('button', { name: 'Add to canvas' })).toHaveCount(0);
  await expect(modal(page).getByTestId('trace-compare')).toHaveCount(0);
  await expect(page.getByText('Traced image', { exact: true })).toHaveCount(0);
});

test('webp input traces', async ({ page }) => {
  await openTraceModal(page, WEBP);
  await runTrace(page);
  await modal(page).getByRole('button', { name: 'Add to canvas' }).click();
  await expect(page.getByText('Traced image', { exact: true })).toBeVisible();
});
