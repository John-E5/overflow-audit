#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { audit, DEFAULT_SETTLE_MS, DEFAULT_TIMEOUT_MS, type AuditOptions } from './audit.js';
import { exitCode, formatResult, summary } from './report.js';
import { parseUrlList } from './urls.js';

const USAGE = `Usage: overflow-audit [urls...] [--file urls.txt] [--base URL]
                      [--width 390]... [--settle 1500] [--timeout 30000] [--setup ./login.mjs]
                      [--screenshots dir] [--ignore selector]... [--json]

Visits each page at phone width and fails when anything makes it scroll sideways.
Exit 0: everything fits. 1: a page overflows. 2: bad arguments, or a page didn't load.`;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function parse() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        file: { type: 'string' },
        base: { type: 'string' },
        width: { type: 'string', multiple: true },
        settle: { type: 'string' },
        timeout: { type: 'string' },
        setup: { type: 'string' },
        screenshots: { type: 'string' },
        ignore: { type: 'string', multiple: true },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    return fail(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
  }
}

function wholeNumber(flag: string, value: string, { positive }: { positive: boolean }): number {
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (Number.isNaN(n) || (positive && n === 0)) fail(`overflow-audit: ${flag} must be a ${positive ? 'positive ' : ''}whole number, got "${value}"`);
  return n;
}

async function loadSetup(path: string): Promise<NonNullable<AuditOptions['setup']>> {
  const mod = (await import(pathToFileURL(resolve(path)).href)) as { default?: unknown };
  if (typeof mod.default !== 'function') fail(`overflow-audit: ${path} must export a default async function (context, { base })`);
  return mod.default as NonNullable<AuditOptions['setup']>;
}

async function main(): Promise<number> {
  const { values, positionals } = parse();
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const urls = [...positionals];
  if (values.file) urls.push(...parseUrlList(await readFile(values.file, 'utf8')));
  if (urls.length === 0) fail(USAGE);

  const options: AuditOptions = {
    urls,
    base: values.base,
    widths: (values.width ?? []).map((w) => wholeNumber('--width', w, { positive: true })),
    settleMs: values.settle === undefined ? DEFAULT_SETTLE_MS : wholeNumber('--settle', values.settle, { positive: false }),
    timeoutMs: values.timeout === undefined ? DEFAULT_TIMEOUT_MS : wholeNumber('--timeout', values.timeout, { positive: true }),
    screenshotsDir: values.screenshots,
    ignore: values.ignore,
  };
  if (values.setup) options.setup = await loadSetup(values.setup);

  const results = await audit(options);
  if (values.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) console.log(formatResult(r));
    console.log(summary(results));
  }
  return exitCode(results);
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => fail(`overflow-audit: ${err instanceof Error ? err.message : String(err)}`),
);
