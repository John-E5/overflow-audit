import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { MEASURE_SOURCE } from './measure.js';
import { resolveUrl } from './urls.js';

/** Always hidden: the Next.js dev overlay, and anything marked data-overflow-audit-ignore. */
export const DEFAULT_IGNORE = ['nextjs-portal', '[data-overflow-audit-ignore]'];
export const DEFAULT_WIDTHS = [390];
export const DEFAULT_SETTLE_MS = 1500;
/** iPhone-class viewport height. Height doesn't affect sideways overflow, but it shapes the screenshots. */
const MOBILE_HEIGHT = 844;
const NETWORK_IDLE_CAP_MS = 10_000;

export interface Result {
  url: string;
  width: number;
  /** True when the page doesn't scroll sideways and no element sticks out. */
  ok: boolean;
  /** How many pixels the page scrolls sideways. 1 or less is rounding, and passes. */
  overflow: number;
  /** Up to three elements past the edge, as `tag#id.class@right` (`@left` on a right-to-left page). */
  offenders: string[];
  /** Path of the full-page screenshot, when screenshots are on. */
  screenshot?: string;
  /** Set when the page failed to load or answered HTTP 400 or above. */
  error?: string;
}

export interface AuditOptions {
  /** Absolute URLs, or paths resolved against `base`. */
  urls: string[];
  base?: string;
  /** Viewport widths in CSS pixels. Default [390]. */
  widths?: number[];
  /** Extra wait after the page loads, for animations and late layout. Default 1500 ms. */
  settleMs?: number;
  /** Signs in once. The resulting cookies and storage are reused for every page. */
  setup?: (context: BrowserContext, info: { base?: string }) => Promise<void>;
  /** Writes a full-page PNG per page and width into this folder. */
  screenshotsDir?: string;
  /** CSS selectors hidden during the check, added to the defaults. */
  ignore?: string[];
}

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** Checks every URL at every width. Results are ordered by width, then by URL. */
export async function audit(options: AuditOptions): Promise<Result[]> {
  const urls = options.urls.map((u) => resolveUrl(u, options.base));
  if (urls.length === 0) throw new Error('audit: no URLs to check');
  const widths = options.widths?.length ? options.widths : DEFAULT_WIDTHS;
  if (widths.some((w) => !Number.isInteger(w) || w <= 0)) throw new Error('audit: widths must be positive whole numbers');
  const ignore = [...DEFAULT_IGNORE, ...(options.ignore ?? [])];
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;

  const { chromium } = await loadPlaywright();
  if (options.screenshotsDir) await mkdir(options.screenshotsDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const storageState = options.setup ? await runSetup(browser, options.setup, options.base) : undefined;
    const results: Result[] = [];
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: MOBILE_HEIGHT },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        storageState,
      });
      try {
        const page = await context.newPage();
        for (const url of urls) results.push(await check(page, url, width, ignore, settleMs, options.screenshotsDir));
      } finally {
        await context.close();
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}

/** A file-name-safe version of the URL's path and query, for example `/a/b.html?x=1` becomes `a-b-html-x-1`. */
export function slug(url: string): string {
  const { pathname, search } = new URL(url);
  const s = (pathname + search).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return s || 'index';
}

async function runSetup(browser: Browser, setup: NonNullable<AuditOptions['setup']>, base: string | undefined): Promise<StorageState> {
  const context = await browser.newContext();
  try {
    await setup(context, { base });
    return await context.storageState();
  } finally {
    await context.close();
  }
}

async function check(page: Page, url: string, width: number, ignore: string[], settleMs: number, dir: string | undefined): Promise<Result> {
  const failed = (error: string): Result => ({ url, width, ok: false, overflow: 0, offenders: [], error });
  try {
    const response = await page.goto(url, { waitUntil: 'load' });
    if (response && response.status() >= 400) return failed(`HTTP ${response.status()}`);
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_CAP_MS }).catch(() => {});
    if (settleMs > 0) await page.waitForTimeout(settleMs);
    // One rule per selector, so one invalid selector can't void the others.
    await page.addStyleTag({ content: ignore.map((s) => `${s}{display:none!important}`).join('\n') });
    const { overflow, offenders } = (await page.evaluate(`(${MEASURE_SOURCE})()`)) as { overflow: number; offenders: string[] };
    const result: Result = { url, width, ok: overflow <= 1 && offenders.length === 0, overflow, offenders };
    if (dir) {
      result.screenshot = join(dir, `${slug(url)}@${width}.png`);
      await page.screenshot({ path: result.screenshot, fullPage: true });
    }
    return result;
  } catch (err) {
    return failed(err instanceof Error ? (err.message.split('\n')[0] ?? err.message) : String(err));
  }
}

async function loadPlaywright(): Promise<typeof import('playwright')> {
  try {
    return await import('playwright');
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error('overflow-audit needs Playwright: npm install -D playwright && npx playwright install chromium');
    }
    throw err;
  }
}
