import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { audit, type Result } from '../src/index.js';
import { serveFixtures } from './fixtures/serve.mjs';

// Real-world layouts, measured the way a phone sees them.
const PAGES = [
  '/offcanvas-fixed.html',
  '/offcanvas-absolute.html',
  '/svg.html',
  '/rtl-fits.html',
  '/rtl-drawer.html',
  '/long-word.html',
  '/shadow.html',
  '/abs-escape.html',
  '/wrapper.html',
  '/subpixel.html',
];
let server: Awaited<ReturnType<typeof serveFixtures>>;
let results: Result[];

const find = (path: string): Result => {
  const r = results.find((x) => x.url.endsWith(path));
  if (!r) throw new Error(`no result for ${path}`);
  return r;
};

beforeAll(async () => {
  server = await serveFixtures();
  results = await audit({ base: server.url, urls: PAGES, settleMs: 0 });
});
afterAll(() => server.close());

describe('measuring like a phone', () => {
  it('passes a closed off-canvas menu that is position: fixed, because it cannot scroll the page', () => {
    expect(find('/offcanvas-fixed.html')).toMatchObject({ ok: true, overflow: 0, offenders: [] });
  });

  it('fails the same menu when it is position: absolute, because that does scroll the page', () => {
    expect(find('/offcanvas-absolute.html')).toMatchObject({ ok: false, overflow: 300, offenders: ['nav.drawer@690'] });
  });

  it('passes SVG shapes drawn outside their <svg>, which do not widen the page', () => {
    expect(find('/svg.html')).toMatchObject({ ok: true, offenders: [] });
  });

  it('passes an RTL page with content off to the right, which cannot be scrolled to', () => {
    expect(find('/rtl-fits.html')).toMatchObject({ ok: true, overflow: 0, offenders: [] });
  });

  it('fails an RTL page with a drawer off to the left and names it by its left edge', () => {
    expect(find('/rtl-drawer.html')).toMatchObject({ ok: false, overflow: 300, offenders: ['nav.drawer@-300'] });
  });

  it('names the element whose text runs past the edge', () => {
    const r = find('/long-word.html');
    expect(r.ok).toBe(false);
    expect(r.offenders).toHaveLength(1);
    expect(r.offenders[0]).toMatch(/^p\.long@\d+$/);
  });

  it('names an element inside a shadow root, prefixed by its host', () => {
    expect(find('/shadow.html')).toMatchObject({ ok: false, overflow: 210, offenders: ['my-widget>div.wide@600'] });
  });

  it('names an absolute element that escapes an overflow: hidden parent that is not its containing block', () => {
    expect(find('/abs-escape.html')).toMatchObject({ ok: false, overflow: 210, offenders: ['div.escapee@600'] });
  });

  it('names only the topmost offender, not its children', () => {
    expect(find('/wrapper.html')).toMatchObject({ ok: false, overflow: 210, offenders: ['div.wrapper@600'] });
  });

  it('allows 1px for rounding, for the page and for elements alike', () => {
    expect(find('/subpixel.html')).toMatchObject({ ok: true, offenders: [] });
  });
});
