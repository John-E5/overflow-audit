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
  '/contain-paint.html',
  '/content-visibility.html',
  '/fixed-held.html',
  '/body-text.html',
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

  it('passes content clipped by paint containment, including a long word', () => {
    expect(find('/contain-paint.html')).toMatchObject({ ok: true, overflow: 0, offenders: [] });
  });

  it('passes content inside content-visibility, which clips like paint containment', () => {
    expect(find('/content-visibility.html')).toMatchObject({ ok: true, overflow: 0, offenders: [] });
  });

  it('names fixed elements that will-change, backdrop-filter or a container make scroll with the page', () => {
    expect(find('/fixed-held.html')).toMatchObject({ ok: false, offenders: ['div.wc@600', 'div.bf@600', 'div.ct@600'] });
  });

  it('names <body> when text directly inside it runs past the edge', () => {
    const r = find('/body-text.html');
    expect(r.ok).toBe(false);
    expect(r.offenders).toHaveLength(1);
    expect(r.offenders[0]).toMatch(/^body@\d+$/);
  });
});
