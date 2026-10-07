import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const tokens = new WeakMap<Page, string>();

async function add(page: Page, title: string, type: 'Games' | 'Books' | 'Movies') {
  await page.getByRole('button', { name: 'Add an item', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: type, exact: true }).click();
  await dialog.getByRole('button', { name: 'Add manually', exact: true }).first().click();
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Add to backlog', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(`backlog-${randomUUID()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('Backlog-test-123!');
  await page.getByLabel('Confirm password', { exact: true }).fill('Backlog-test-123!');
  const loading = page.waitForRequest(request => request.url().endsWith('/api/backlog') && Boolean(request.headers().authorization));
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  tokens.set(page, (await loading).headers().authorization);
  await expect(page.getByRole('heading', { name: 'Your backlog.' })).toBeVisible();
});

test('add three media types, reorder, filter, reload, and remove', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make a little room for inspiration.' })).toBeVisible();
  await page.screenshot({ path: `test-results/empty-${test.info().project.name}.png`, fullPage: true });
  await add(page, 'Hades', 'Games');
  await add(page, 'Dune', 'Books');
  await add(page, 'Perfect Days', 'Movies');
  await page.getByRole('button', { name: 'Move Perfect Days up', exact: true }).click();
  await expect(page.locator('.backlog-row h3')).toHaveText(['Hades', 'Perfect Days', 'Dune']);
  await page.reload();
  await expect(page.locator('.backlog-row h3')).toHaveText(['Hades', 'Perfect Days', 'Dune']);
  await page.getByRole('navigation').getByRole('button', { name: /Books/ }).click();
  await expect(page.locator('.backlog-row h3')).toHaveText(['Dune']);
  await page.getByRole('navigation').getByRole('button', { name: /All items/ }).click();
  await add(page, 'Hades', 'Games');
  await expect(page.locator('.backlog-row')).toHaveCount(3);
  await page.screenshot({ path: `test-results/populated-${test.info().project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove Dune', exact: true }).click();
  await expect(page.locator('.backlog-row')).toHaveCount(2);
});

test('catalog search, add result, and keyboard reorder', async ({ page }) => {
  await page.route('**/api/search?**', route => route.fulfill({ json: { results: [{ type: 'book', title: 'The Hobbit', subtitle: 'J. R. R. Tolkien', year: '1937', coverUrl: '', source: 'openlibrary', sourceId: '/works/OLHOBBIT' }] } }));
  await page.goto('/');
  await add(page, 'Hades', 'Games');
  await page.getByRole('button', { name: 'Add an item', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Books', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Search catalog', exact: true }).fill('hobbit');
  await dialog.getByRole('button', { name: 'Add The Hobbit', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const snapshot = await (await page.request.get('/api/backlog', { headers: { Authorization: tokens.get(page)! } })).json();
  const targetId = snapshot.entries.find((entry: { title: string }) => entry.title === 'Hades').id;
  const handle = page.getByRole('button', { name: 'Drag The Hobbit to reorder', exact: true });
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  // The sensor measures droppable rectangles after activation; wait for that state.
  await expect(page.getByRole('status').filter({ hasText: /was moved over/ })).toContainText('droppable area');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('status').filter({ hasText: /was moved over/ })).toContainText(`droppable area ${targetId}`);
  await page.keyboard.press('Space');
  await expect(page.locator('.backlog-row h3')).toHaveText(['The Hobbit', 'Hades']);
  await page.reload();
  await expect(page.locator('.backlog-row h3')).toHaveText(['The Hobbit', 'Hades']);
});

test('pointer drag saves the new order', async ({ page }) => {
  await page.goto('/');
  await add(page, 'First game', 'Games');
  await add(page, 'Second game', 'Games');
  const handle = page.getByRole('button', { name: 'Drag Second game to reorder', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await page.getByRole('button', { name: 'Drag First game to reorder', exact: true }).boundingBox();
  if (!from || !to) throw new Error('Drag handles not visible');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('.backlog-row h3')).toHaveText(['Second game', 'First game']);
  await page.reload();
  await expect(page.locator('.backlog-row h3')).toHaveText(['Second game', 'First game']);
});

test('failed saves keep the entry form and show a recoverable error', async ({ page }) => {
  await page.goto('/');
  await page.route('**/api/backlog', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, json: { error: 'Test save failure. Please try again.' } }) : route.continue());
  await page.getByRole('button', { name: 'Add an item', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add manually', exact: true }).first().click();
  await dialog.getByLabel('Title').fill('Keep this title');
  await dialog.getByRole('button', { name: 'Add to backlog', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Test save failure');
  await expect(dialog.getByLabel('Title')).toHaveValue('Keep this title');
});
