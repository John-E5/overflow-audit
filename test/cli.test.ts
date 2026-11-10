import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveFixtures } from './fixtures/serve.mjs';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
let server: Awaited<ReturnType<typeof serveFixtures>>;
beforeAll(async () => {
  server = await serveFixtures();
});
afterAll(() => server.close());

async function run(args: string[]) {
  const child = spawn(process.execPath, ['--import', 'tsx', CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  const [code] = await once(child, 'exit');
  return { code: code as number, stdout, stderr };
}

const tmpFile = (name: string, text: string) => {
  const file = join(mkdtempSync(join(tmpdir(), 'overflow-audit-cli-')), name);
  writeFileSync(file, text);
  return file;
};

describe('overflow-audit CLI', () => {
  it('prints usage and exits 2 with no URLs', async () => {
    const r = await run([]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Usage: overflow-audit');
  });

  it('exits 0 when every page fits', async () => {
    const r = await run(['--base', server.url, '/fits.html', '--settle', '0']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`OK   ${server.url}/fits.html @390`);
    expect(r.stdout).toContain('All 1 check passed.');
  });

  it('exits 1 and names the offender when a page overflows', async () => {
    const r = await run(['--base', server.url, '/overflows.html', '--settle', '0']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('FAIL');
    expect(r.stdout).toContain('div.hero.wide@600');
  });

  it('prints JSON with --json', async () => {
    const r = await run(['--base', server.url, '/overflows.html', '--settle', '0', '--json']);
    const results = JSON.parse(r.stdout) as Array<{ ok: boolean; width: number }>;
    expect(r.code).toBe(1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ ok: false, width: 390 });
  });

  it('reads a URL file and checks every width', async () => {
    const file = tmpFile('urls.txt', '# pages\n/fits.html\n\n/narrow-only.html\n');
    const r = await run(['--file', file, '--base', server.url, '--width', '390', '--width', '360', '--settle', '0']);
    expect(r.code).toBe(1);
    expect(r.stdout.split('\n').filter((l) => /^(OK|FAIL)/.test(l))).toHaveLength(4);
    expect(r.stdout).toContain('1 of 4 checks failed.');
  });

  it('adds --ignore selectors to the defaults', async () => {
    const r = await run(['--base', server.url, '/ignored.html', '--settle', '0', '--ignore', '.ad']);
    expect(r.code).toBe(0);
  });

  it('runs a --setup module', async () => {
    const setup = tmpFile('login.mjs', "export default async (context, { base }) => { await context.addCookies([{ name: 'audit', value: '1', url: base }]); };\n");
    const r = await run(['--base', server.url, '/cookie.html', '--settle', '0', '--setup', setup]);
    expect(r.code).toBe(0);
  });

  it('exits 2 on bad arguments', async () => {
    const noBase = await run(['/fits.html']);
    expect(noBase.code).toBe(2);
    expect(noBase.stderr).toContain('pass a base URL');

    const badWidth = await run(['--base', server.url, '/fits.html', '--width', 'abc']);
    expect(badWidth.code).toBe(2);
    expect(badWidth.stderr).toContain('--width must be a positive whole number');

    const badTimeout = await run(['--base', server.url, '/fits.html', '--timeout', '0']);
    expect(badTimeout.code).toBe(2);
    expect(badTimeout.stderr).toContain('--timeout must be a positive whole number');

    const badSetup = await run(['--base', server.url, '/fits.html', '--setup', tmpFile('setup.mjs', 'export const x = 1;\n')]);
    expect(badSetup.code).toBe(2);
    expect(badSetup.stderr).toContain('must export a default async function');
  });

  it('gives up on a page after --timeout and exits 2', async () => {
    const r = await run(['--base', server.url, '/never.png', '--settle', '0', '--timeout', '1000']);
    expect(r.code).toBe(2);
    expect(r.stdout).toContain('Timeout 1000ms exceeded');
  });

  it('exits 2 when a page does not load', async () => {
    const r = await run(['--base', server.url, '/missing.html', '--settle', '0']);
    expect(r.code).toBe(2);
    expect(r.stdout).toContain('ERR ');
  });
});
