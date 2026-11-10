import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { screenshotNames } from '../src/audit.js';
import { audit, exitCode, formatResult } from '../src/index.js';
import { serveFixtures } from './fixtures/serve.mjs';

let server: Awaited<ReturnType<typeof serveFixtures>>;
beforeAll(async () => {
  server = await serveFixtures();
});
afterAll(() => server.close());

describe('screenshotNames', () => {
  it('numbers URLs whose names collide, ignoring case for case-insensitive file systems', () => {
    expect(screenshotNames(['http://h/a/b', 'http://h/a-b', 'http://h/A-B', 'http://h/a/b', 'http://h/c'])).toEqual(['a-b', 'a-b-2', 'A-B-3', 'a-b-4', 'c']);
  });

  it('includes the host only when the URLs have different hosts', () => {
    expect(screenshotNames(['http://h/', 'http://h/x'])).toEqual(['index', 'x']);
    expect(screenshotNames(['https://a.com/', 'http://b.com:8080/x'])).toEqual(['a-com', 'b-com-8080-x']);
  });
});

describe('screenshots', () => {
  it('gives colliding URLs their own files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'overflow-audit-names-'));
    const results = await audit({ base: server.url, urls: ['/fits.html?a=b', '/fits.html?a-b'], settleMs: 0, screenshotsDir: dir });
    expect(results.map((r) => r.screenshot)).toEqual([join(dir, 'fits-html-a-b@390.png'), join(dir, 'fits-html-a-b-2@390.png')]);
    for (const r of results) expect(existsSync(r.screenshot!)).toBe(true);
  });

  it('keeps the measurement when the screenshot cannot be written', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'overflow-audit-blocked-'));
    mkdirSync(join(dir, 'overflows-html@390.png')); // a folder where the file should go
    const [r] = await audit({ base: server.url, urls: ['/overflows.html'], settleMs: 0, screenshotsDir: dir });
    expect(r).toMatchObject({ ok: false, overflow: 210, offenders: ['div.hero.wide@600'] });
    expect(r?.error).toBeUndefined();
    expect(r?.screenshot).toBeUndefined();
    expect(r?.screenshotError).toBeTruthy();
    expect(exitCode([r!])).toBe(1);
    expect(formatResult(r!)).toMatch(/^FAIL .* offenders=\[div\.hero\.wide@600\] \(no screenshot: .+\)$/);
  });
});
