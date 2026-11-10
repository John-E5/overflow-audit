import { afterAll, beforeAll, expect, it } from 'vitest';
import { serveFixtures } from './fixtures/serve.mjs';

let server: Awaited<ReturnType<typeof serveFixtures>>;
beforeAll(async () => {
  server = await serveFixtures();
});
afterAll(() => server.close());

it('serves fixture pages and 404s everything else', async () => {
  expect((await fetch(`${server.url}/fits.html`)).status).toBe(200);
  expect((await fetch(`${server.url}/missing.html`)).status).toBe(404);
  expect((await fetch(`${server.url}/../package.json`)).status).toBe(404);
});

it('makes /cookie.html depend on the audit cookie', async () => {
  expect(await (await fetch(`${server.url}/cookie.html`)).text()).toContain('login-wall');
  expect(await (await fetch(`${server.url}/cookie.html`, { headers: { cookie: 'audit=1' } })).text()).toContain('signed in');
});
