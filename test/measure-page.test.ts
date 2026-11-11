import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { measurePage } from '../src/index.js';
import { serveFixtures } from './fixtures/serve.mjs';

let server: Awaited<ReturnType<typeof serveFixtures>>;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  server = await serveFixtures();
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await context.newPage();
});
afterAll(async () => {
  await browser.close();
  await server.close();
});
beforeEach(async () => {
  await page.goto(`${server.url}/toggle.html`);
});

describe('measurePage', () => {
  it('measures the page as it is now', async () => {
    expect(await measurePage(page)).toEqual({ ok: true, overflow: 0, offenders: [] });
  });

  it('catches a state only reachable by interacting', async () => {
    await page.click('#open');
    expect(await measurePage(page)).toMatchObject({ ok: false, offenders: ['div#sheet.sheet@600'] });
  });

  it('hides extra ignore selectors on top of the defaults', async () => {
    await page.click('#open');
    expect((await measurePage(page, { ignore: ['#sheet'] })).ok).toBe(true);
  });
});
