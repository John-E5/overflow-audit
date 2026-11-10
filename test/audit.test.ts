import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { audit, slug, type Result } from '../src/index.js';
import { serveFixtures } from './fixtures/serve.mjs';

const PAGES = ['/fits.html', '/overflows.html', '/scroller.html', '/clipped.html', '/ignored.html', '/narrow-only.html', '/missing.html'];
const shots = mkdtempSync(join(tmpdir(), 'overflow-audit-'));
let server: Awaited<ReturnType<typeof serveFixtures>>;
let results: Result[];

const find = (path: string, width = 390): Result => {
  const r = results.find((x) => x.url.endsWith(path) && x.width === width);
  if (!r) throw new Error(`no result for ${path} @${width}`);
  return r;
};

beforeAll(async () => {
  server = await serveFixtures();
  results = await audit({ base: server.url, urls: PAGES, widths: [390, 360], settleMs: 0, ignore: ['.ad'], screenshotsDir: shots });
});
afterAll(() => server.close());

describe('audit', () => {
  it('passes a page that fits', () => {
    expect(find('/fits.html')).toMatchObject({ ok: true, offenders: [] });
  });

  // Regression: mobile emulation widens window.innerWidth on overflowing pages, which once hid every overflow.
  it('fails a page with a wide element and names it', () => {
    expect(find('/overflows.html')).toMatchObject({ ok: false, overflow: 210, offenders: ['div.hero.wide@600'] });
  });

  it('allows content inside a horizontal scroller', () => {
    expect(find('/scroller.html').ok).toBe(true);
  });

  it('allows content clipped by an overflow-hidden ancestor, like a carousel', () => {
    expect(find('/clipped.html').ok).toBe(true);
  });

  it('hides the default and the custom ignore selectors', () => {
    expect(find('/ignored.html').ok).toBe(true);
  });

  it('checks every width', () => {
    expect(find('/narrow-only.html', 390).ok).toBe(true);
    expect(find('/narrow-only.html', 360)).toMatchObject({ ok: false, offenders: ['div.card@375'] });
    // Chromium's mobile emulation rounds the layout width up (15 or 16), so only assert it is positive.
    expect(find('/narrow-only.html', 360).overflow).toBeGreaterThan(0);
  });

  it('reports a page that fails to load', () => {
    expect(find('/missing.html')).toMatchObject({ ok: false, error: 'HTTP 404', offenders: [] });
    expect(find('/missing.html').screenshot).toBeUndefined();
  });

  it('writes a full-page screenshot per page and width', () => {
    const shot = find('/fits.html', 360).screenshot;
    expect(shot).toBe(join(shots, 'fits-html@360.png'));
    expect(existsSync(shot!)).toBe(true);
  });

  it('orders results by width, then URL', () => {
    expect(results.map((r) => r.width)).toEqual([...PAGES.map(() => 390), ...PAGES.map(() => 360)]);
  });

  it('flags an ignored-by-default element only when its selector is not ignored', async () => {
    const [r] = await audit({ base: server.url, urls: ['/ignored.html'], settleMs: 0 });
    expect(r?.offenders).toEqual(['div.ad@700']);
  });

  it('runs setup once and reuses its signed-in state', async () => {
    let calls = 0;
    const [signedIn] = await audit({
      base: server.url,
      urls: ['/cookie.html'],
      widths: [390, 360],
      settleMs: 0,
      setup: async (context, { base }) => {
        calls += 1;
        await context.addCookies([{ name: 'audit', value: '1', url: base! }]);
      },
    });
    const [anonymous] = await audit({ base: server.url, urls: ['/cookie.html'], settleMs: 0 });
    expect(calls).toBe(1);
    expect(signedIn?.ok).toBe(true);
    expect(anonymous).toMatchObject({ ok: false, offenders: ['div.login-wall@800'] });
  });
});

describe('audit input checks', () => {
  it('rejects bad input before launching a browser', async () => {
    await expect(audit({ urls: ['/x'] })).rejects.toThrow('pass a base URL');
    await expect(audit({ urls: [] })).rejects.toThrow('audit: no URLs to check');
    await expect(audit({ urls: ['http://x'], widths: [0] })).rejects.toThrow('audit: widths must be positive whole numbers');
  });
});

describe('slug', () => {
  it('turns the path and query into a file name', () => {
    expect(slug('http://h:1/a/b.html?x=1')).toBe('a-b-html-x-1');
    expect(slug('http://h/')).toBe('index');
  });
});
