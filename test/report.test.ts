import { describe, expect, it } from 'vitest';
import type { Result } from '../src/audit.js';
import { exitCode, formatResult, summary } from '../src/report.js';

const ok: Result = { url: 'http://h/a', width: 390, ok: true, overflow: 0, offenders: [] };
const bad: Result = { url: 'http://h/b', width: 360, ok: false, overflow: 210, offenders: ['div.hero@600', 'img@590'] };
const err: Result = { url: 'http://h/c', width: 390, ok: false, overflow: 0, offenders: [], error: 'HTTP 404' };

describe('formatResult', () => {
  it('formats each outcome', () => {
    expect(formatResult(ok)).toBe('OK   http://h/a @390');
    expect(formatResult(bad)).toBe('FAIL http://h/b @360 overflow=210px offenders=[div.hero@600, img@590]');
    expect(formatResult(err)).toBe('ERR  http://h/c @390 HTTP 404');
  });
});

describe('summary', () => {
  it('counts failures', () => {
    expect(summary([ok])).toBe('All 1 check passed.');
    expect(summary([ok, ok])).toBe('All 2 checks passed.');
    expect(summary([ok, bad, err])).toBe('2 of 3 checks failed.');
  });
});

describe('exitCode', () => {
  it('is 0 when all pass, 1 on overflow, 2 when a page did not load', () => {
    expect(exitCode([ok])).toBe(0);
    expect(exitCode([ok, bad])).toBe(1);
    expect(exitCode([bad, err])).toBe(2);
  });
});
