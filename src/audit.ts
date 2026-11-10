import type { BrowserContext } from 'playwright';

export interface Result {
  url: string;
  width: number;
  /** True when the page doesn't scroll sideways and no element sticks out. */
  ok: boolean;
  /** How many pixels the page scrolls sideways (0 or less means none). */
  overflow: number;
  /** Up to three elements past the right edge, as `tag#id.class@right`. */
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
