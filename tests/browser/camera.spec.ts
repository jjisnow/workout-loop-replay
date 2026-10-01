import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('captures, delays, pauses, downloads and releases a browser camera', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Advanced Settings' }).click();
  await page.getByLabel('Delay', { exact: true }).focus();
  await page.getByLabel('Delay', { exact: true }).press('Home');
  await expect(page.getByLabel('Delay', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Start Camera', exact: true }).click();
  const delayed = page.locator('canvas');
  await expect(delayed).toBeVisible({ timeout: 15_000 });
  await expect(delayed).toHaveJSProperty('width', 1280);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save Video/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.(mp4|webm|mkv)$/);
  expect(await download.failure()).toBeNull();
  const file = await download.path();
  expect(file).not.toBeNull();
  const bytes = await readFile(file!);
  expect(bytes.length).toBeGreaterThan(500);
  const dimensions = await page.evaluate(async ({ base64, name }) => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: name.endsWith('.mp4') ? 'video/mp4' : 'video/webm' }));
    const video = document.createElement('video');
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Downloaded video could not be opened'));
        video.src = url;
      });
      return [video.videoWidth, video.videoHeight];
    } finally { video.src = ''; URL.revokeObjectURL(url); }
  }, { base64: bytes.toString('base64'), name: download.suggestedFilename() });
  expect(dimensions).toEqual([1280, 720]);
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(delayed).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start Camera', exact: true })).toBeVisible();
  expect(await page.locator('video').evaluate(video => (video as HTMLVideoElement).srcObject)).toBeNull();
  expect(errors).toEqual([]);
});

test('constrains delay to available buffer and keeps mobile layout usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Advanced Settings' }).click();
  await page.getByLabel('Delay', { exact: true }).focus();
  await page.getByLabel('Delay', { exact: true }).press('End');
  await expect(page.getByLabel('Delay', { exact: true })).toHaveValue('30');
  await expect(page.getByLabel('Buffer Size', { exact: true })).toHaveValue('30');
  await page.getByLabel('Buffer Size', { exact: true }).focus();
  await page.getByLabel('Buffer Size', { exact: true }).press('Home');
  await expect(page.getByLabel('Delay', { exact: true })).toHaveValue('5');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
