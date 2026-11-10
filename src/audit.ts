import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { MEASURE_SOURCE } from './measure.js';
import { resolveUrl } from './urls.js';

/** Always hidden: the Next.js dev overlay, and anything marked data-overflow-audit-ignore. */
export const DEFAULT_IGNORE = ['nextjs-portal', '[data-overflow-audit-ignore]'];
export const DEFAULT_WIDTHS = [390];
export const DEFAULT_SETTLE_MS = 1500;
export const DEFAULT_TIMEOUT_MS = 30_000;
/** iPhone-class viewport height. Height doesn't affect sideways overflow, but it shapes the screenshots. */
const MOBILE_HEIGHT = 844;
/** Caps on the wait for the load event and for network idle, so one stalled image or tracker can't fail a page. */
const LOAD_CAP_MS = 10_000;
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
  /** Set when screenshots are on but this one couldn't be taken. The measurement still stands. */
  screenshotError?: string;
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
  /** How long to wait for a page to start rendering before reporting an error. Default 30 000 ms. */
  timeoutMs?: number;
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('audit: timeoutMs must be a positive whole number');

  const { chromium } = await loadPlaywright();
  if (options.screenshotsDir) await mkdir(options.screenshotsDir, { recursive: true });
  const names = screenshotNames(urls);
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
        // The ignore styles are injected inline, which a strict Content-Security-Policy would block.
        bypassCSP: true,
        storageState,
      });
      try {
        // One page per width, reused across URLs. Cookies, localStorage and sessionStorage carry over from one URL
        // to the next (as they would for a visitor), but not across widths, which each get a fresh context.
        const newPage = async () => {
          const p = await context.newPage();
          p.setDefaultTimeout(timeoutMs);
          return p;
        };
        let page = await newPage();
        for (const [i, url] of urls.entries()) {
          const shot = options.screenshotsDir ? join(options.screenshotsDir, `${names[i]}@${width}.png`) : undefined;
          const result = await check(page, url, width, ignore, settleMs, timeoutMs, shot);
          results.push(result);
          if (result.error || result.screenshotError) {
            // A crashed or wedged page would fail every URL after it, so start the next one on a fresh page.
            await page.close().catch(() => {});
            page = await newPage();
          }
        }
      } finally {
        await context.close();
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}

/**
 * A file-name-safe version of the URL's path and query, for example `/a/b.html?x=1` becomes `a-b-html-x-1`.
 * With `withHost`, the host comes first: `http://h:1/a` becomes `h-1-a`.
 */
export function slug(url: string, withHost = false): string {
  const { host, pathname, search } = new URL(url);
  const s = ((withHost ? `${host}/` : '') + pathname + search)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');
  return s || 'index';
}

/**
 * One screenshot name per URL, unique within the run: a name that's already taken (ignoring case, for
 * case-insensitive file systems) gets `-2`, `-3` and so on. Names include the host when the URLs have different hosts.
 */
export function screenshotNames(urls: string[]): string[] {
  const withHost = new Set(urls.map((u) => new URL(u).host)).size > 1;
  const taken = new Set<string>();
  return urls.map((url) => {
    const base = slug(url, withHost);
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}-${n}`;
    taken.add(name.toLowerCase());
    return name;
  });
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

async function check(page: Page, url: string, width: number, ignore: string[], settleMs: number, timeoutMs: number, shot: string | undefined): Promise<Result> {
  const failed = (error: string): Result => ({ url, width, ok: false, overflow: 0, offenders: [], error });
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (response && response.status() >= 400) return failed(`HTTP ${response.status()}`);
    await page.waitForLoadState('load', { timeout: LOAD_CAP_MS }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_CAP_MS }).catch(() => {});
    if (settleMs > 0) await page.waitForTimeout(settleMs);
    // One rule per selector, so one invalid selector can't void the others.
    // These run in the page, so a page stuck in a loop would never answer them: give each one timeoutMs.
    await within(page.addStyleTag({ content: ignore.map((s) => `${s}{display:none!important}`).join('\n') }), timeoutMs, 'hiding ignored elements');
    const { overflow, offenders } = (await within(page.evaluate(`(${MEASURE_SOURCE})()`), timeoutMs, 'measuring')) as { overflow: number; offenders: string[] };
    const result: Result = { url, width, ok: overflow <= 1 && offenders.length === 0, overflow, offenders };
    if (shot) {
      try {
        await within(page.screenshot({ path: shot, fullPage: true }), timeoutMs, 'the screenshot');
        result.screenshot = shot;
      } catch (err) {
        result.screenshotError = firstLine(err);
      }
    }
    return result;
  } catch (err) {
    return failed(firstLine(err));
  }
}

/** Rejects when `promise` hasn't settled within `ms`. The page is then closed, which settles the promise too. */
async function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms: the page stopped answering`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function firstLine(err: unknown): string {
  return err instanceof Error ? (err.message.split('\n')[0] ?? err.message) : String(err);
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
