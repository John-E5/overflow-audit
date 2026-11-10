import { describe, expect, it } from 'vitest';
import { parseUrlList, resolveUrl } from '../src/urls.js';

describe('parseUrlList', () => {
  it('keeps one URL per line, skipping blanks and # comments', () => {
    expect(parseUrlList('# pages\n/a\n\n  /b  \r\nhttps://x.com/c\n#/skipped\n')).toEqual(['/a', '/b', 'https://x.com/c']);
  });
});

describe('resolveUrl', () => {
  it('leaves absolute URLs alone', () => {
    expect(resolveUrl('https://x.com/c', 'http://ignored')).toBe('https://x.com/c');
  });

  it('resolves paths against the base', () => {
    expect(resolveUrl('/a', 'http://h:1')).toBe('http://h:1/a');
    expect(resolveUrl('a?x=1', 'http://h/app')).toBe('http://h/app/a?x=1');
  });

  it('needs a base for a path', () => {
    expect(() => resolveUrl('/a')).toThrow('"/a" is a path: pass a base URL (--base) to resolve it');
  });
});
