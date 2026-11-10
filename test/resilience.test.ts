import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { audit } from '../src/index.js';
import { serveFixtures } from './fixtures/serve.mjs';

let server: Awaited<ReturnType<typeof serveFixtures>>;
beforeAll(async () => {
  server = await serveFixtures();
});
afterAll(() => server.close());

describe('pages that fight back', () => {
  it('checks a page whose Content-Security-Policy blocks inline styles', async () => {
    const [r] = await audit({ base: server.url, urls: ['/csp.html'], settleMs: 0 });
    expect(r).toMatchObject({ ok: true, offenders: [] });
    expect(r?.error).toBeUndefined();
  });

  // The load wait and the network-idle wait are each capped at 10 s, so this takes about 20 s.
  it('checks a page whose load event never fires', { timeout: 45_000 }, async () => {
    const [r] = await audit({ base: server.url, urls: ['/stalled.html'], settleMs: 0 });
    expect(r).toMatchObject({ ok: true, offenders: [] });
    expect(r?.error).toBeUndefined();
  });

  it('gives up on a page that never answers after timeoutMs, and carries on', async () => {
    const [stuck, next] = await audit({ base: server.url, urls: ['/never.png', '/fits.html'], settleMs: 0, timeoutMs: 1000 });
    expect(stuck?.error).toMatch(/Timeout 1000ms exceeded/);
    expect(next).toMatchObject({ ok: true });
    expect(next?.error).toBeUndefined();
  });

  it('gives up on a page that stops answering after timeoutMs, and carries on with a fresh page', async () => {
    const [busy, next] = await audit({ base: server.url, urls: ['/busy.html', '/fits.html'], settleMs: 0, timeoutMs: 2000 });
    expect(busy?.error).toMatch(/timed out after 2000ms/);
    expect(next).toMatchObject({ ok: true });
    expect(next?.error).toBeUndefined();
  });

  it('rejects a timeout that is not a positive whole number', async () => {
    await expect(audit({ urls: ['http://x'], timeoutMs: 0 })).rejects.toThrow('audit: timeoutMs must be a positive whole number');
  });
});
