import type { Result } from './audit.js';

export function formatResult(r: Result): string {
  const where = `${r.url} @${r.width}`;
  if (r.error) return `ERR  ${where} ${r.error}`;
  const note = r.screenshotError ? ` (no screenshot: ${r.screenshotError})` : '';
  if (r.ok) return `OK   ${where}${note}`;
  return `FAIL ${where} overflow=${r.overflow}px offenders=[${r.offenders.join(', ')}]${note}`;
}

export function summary(results: Result[]): string {
  const failed = results.filter((r) => !r.ok).length;
  const n = results.length;
  return failed === 0 ? `All ${n} check${n === 1 ? '' : 's'} passed.` : `${failed} of ${n} checks failed.`;
}

/** 2 if any page failed to load, 1 if any page overflows, otherwise 0. */
export function exitCode(results: Result[]): 0 | 1 | 2 {
  if (results.some((r) => r.error)) return 2;
  return results.some((r) => !r.ok) ? 1 : 0;
}
