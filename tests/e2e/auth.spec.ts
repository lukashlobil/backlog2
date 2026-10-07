import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const password = 'Backlog-test-123!';
async function credentials(page: Page, email: string, signup = false) {
  if (signup) await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  if (signup) await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: signup ? 'Create account' : 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your backlog.' })).toBeVisible();
}

test('signed-out users cannot access API data and see the sign-in screen', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect((await request.get('/api/backlog')).status()).toBe(401);
  expect((await request.post('/api/backlog', { data: { title: 'Unauthorized' } })).status()).toBe(401);
  expect((await request.get('/api/search?type=book&q=dune')).status()).toBe(401);
  expect((await request.get('/api/backlog', { headers: { Authorization: 'Bearer not-a-token' } })).status()).toBe(401);
  await page.screenshot({ path: `test-results/signin-${test.info().project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('signup, persistence, logout, account switching, and signing back in retain private backlogs', async ({ page }) => {
  const alice = `alice-${randomUUID()}@example.test`;
  const bob = `bob-${randomUUID()}@example.test`;
  await page.goto('/');
  await credentials(page, alice, true);
  await page.getByRole('button', { name: 'Add an item', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add manually', exact: true }).first().click();
  await dialog.getByLabel('Title').fill('Alice’s private game');
  await dialog.getByRole('button', { name: 'Add to backlog', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator('.backlog-row h3')).toHaveText(['Alice’s private game']);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.locator('.backlog-row')).toHaveCount(0);
  await credentials(page, bob, true);
  await expect(page.getByRole('heading', { name: 'Make a little room for inspiration.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await credentials(page, alice);
  await expect(page.locator('.backlog-row h3')).toHaveText(['Alice’s private game']);
});

test('invalid credentials and password reset provide recoverable feedback', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`missing-${randomUUID()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('incorrect');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('incorrect');
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists');
});

test('a rejected API token refresh signs out and removes private UI', async ({ page }) => {
  await page.goto('/');
  await credentials(page, `refresh-${randomUUID()}@example.test`, true);
  await page.route('**/api/backlog', route => route.fulfill({ status: 401, json: { error: 'Session expired' } }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add an item', exact: true })).not.toBeVisible();
});

test('Google sign-in uses the Firebase emulator popup and creates a private session', async ({ page }) => {
  await page.goto('/');
  const opening = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  const popup = await opening;
  await popup.waitForLoadState('load');
  // These selectors belong to the official Auth emulator's local account picker.
  await popup.getByRole('button', { name: 'Add new account', exact: true }).click();
  await popup.locator('#email-input').fill(`google-${randomUUID()}@example.test`);
  await popup.locator('#display-name-input').fill('Google Test User');
  await popup.locator('#sign-in').click();
  await expect(page.getByRole('heading', { name: 'Your backlog.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});
