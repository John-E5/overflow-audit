/** One URL or path per line. Blank lines and lines starting with # are skipped. */
export function parseUrlList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** Absolute http(s) URLs pass through, other absolute URLs are refused, and anything else is a path resolved against `base`. */
export function resolveUrl(url: string, base?: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    throw new Error(
      `"${url}" is not an http(s) URL. If you passed a path like /pricing from Git Bash on Windows, Git Bash turned it into a Windows path: set MSYS_NO_PATHCONV=1`,
    );
  }
  if (!base) throw new Error(`"${url}" is a path: pass a base URL (--base) to resolve it`);
  return new URL(url, base.endsWith('/') ? base : `${base}/`).toString();
}
