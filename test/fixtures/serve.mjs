// Serves the fixture pages. Tests import serveFixtures(); CI runs this file directly (PORT=4173) for the action self-test.
// /cookie.html is the one dynamic page: it only fits when the request carries the cookie audit=1.
// /csp.html is served with a strict Content-Security-Policy, and /never.png (used by /stalled.html) never answers.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const HEADERS = { '/csp.html': { 'Content-Security-Policy': "style-src 'self'" } };

export const page = (body) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font:16px sans-serif}</style></head><body>${body}</body></html>`;

export async function serveFixtures(port = 0) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://fixtures').pathname;
    if (path === '/cookie.html') {
      const signedIn = /(?:^|;\s*)audit=1(?:;|$)/.test(req.headers.cookie ?? '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page(signedIn ? '<p>signed in</p>' : '<div class="login-wall" style="width:800px">please sign in</div>'));
      return;
    }
    if (path === '/never.png') return; // Never answers; close() drops the connection.
    if (!/^\/[\w-]+\.html$/.test(path)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    try {
      const html = await readFile(join(DIR, path.slice(1)), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...HEADERS[path] });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: actual } = server.address();
  return {
    url: `http://127.0.0.1:${actual}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  const { url } = await serveFixtures(Number(process.env.PORT ?? 4173));
  console.log(`fixtures on ${url}`);
}
