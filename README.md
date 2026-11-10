# overflow-audit

**Fail CI when a page scrolls sideways on a phone.** overflow-audit opens each page at phone width in Chromium and checks whether anything sticks out past the screen. If something does, it names the element.

![overflow-audit catching a page that overflows at 360px](assets/demo.gif)

A page that scrolls sideways is the most common mobile layout bug, and it slips through review because desktop screenshots look fine. overflow-audit turns it into a failing check:

```
FAIL http://localhost:3000/pricing @360 overflow=16px offenders=[div.plan-card@375]
```

```bash
npm install -D overflow-audit playwright && npx playwright install chromium
```

## 30-second example

```bash
npx overflow-audit --base http://localhost:3000 / /pricing /blog --width 390 --width 360
```

```
OK   http://localhost:3000/ @390
OK   http://localhost:3000/pricing @390
OK   http://localhost:3000/blog @390
OK   http://localhost:3000/ @360
FAIL http://localhost:3000/pricing @360 overflow=16px offenders=[div.plan-card@375]
OK   http://localhost:3000/blog @360
1 of 6 checks failed.
```

Each offender is `tag#id.class@right`: the element, and where its right edge lands in CSS pixels.

## What counts

- **Fails:** the page scrolls sideways, or a visible element's right edge is past the screen.
- **Passes:**
  - content inside a horizontal scroller (`overflow-x: auto`), such as a wide table;
  - content clipped by an `overflow: hidden` container, such as a carousel;
  - anything you choose to ignore.
- **Still fails:** content clipped by `<html>` or `<body>` itself, because that's content your users can't reach.

## Options

| Flag | Default | |
|---|---|---|
| `urls...`, `--file urls.txt` | | Pages to check. A file has one per line, and `#` starts a comment |
| `--base URL` | | Resolves paths like `/pricing` |
| `--width 390` | `390` | Repeat to check several widths |
| `--settle 1500` | `1500` | Milliseconds to wait after load for animations and late layout |
| `--setup ./login.mjs` | | Sign in first (see below) |
| `--screenshots dir` | | Saves a full-page PNG per page and width |
| `--ignore selector` | | Hides matching elements during the check. Repeatable. `nextjs-portal` and `[data-overflow-audit-ignore]` are always hidden |
| `--json` | | Prints the results as JSON |

**Exit codes:** 0 when everything fits, 1 when a page overflows, and 2 for bad arguments or a page that didn't load (HTTP 400+ or a network error).

## Signed-in pages

`--setup` takes an ES module whose default export signs in. It runs once, and the cookies and storage it leaves behind are reused for every page.

```js
// login.mjs
export default async function (context, { base }) {
  const page = await context.newPage();
  await page.goto(`${base}/sign-in`);
  await page.getByLabel('Email').fill(process.env.TEST_EMAIL);
  await page.getByLabel('Password').fill(process.env.TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${base}/dashboard`);
}
```

## GitHub Action

```yaml
- uses: John-E5/overflow-audit@v0
  with:
    base: http://localhost:3000
    urls: |
      /
      /pricing
      /blog
    widths: 390 360
```

- **Prerequisites:** start your app before this step, and use Node 22 or later (`actions/setup-node`).
- **Screenshots:** they are uploaded as the `overflow-audit` artifact, even when the check fails.
- **Inputs:** `urls`, `file`, `base`, `widths`, `settle`, `setup`, `ignore` (one per line), `screenshots` (`true` or `false`), `artifact-name`, and `package` (the npm install spec, for pinning a version).

## From code

```ts
import { audit } from 'overflow-audit';

const results = await audit({ base: 'http://localhost:3000', urls: ['/', '/pricing'], widths: [390, 360] });
// [{ url, width, ok, overflow, offenders, screenshot?, error? }, ...]
```

## Requirements

Node 22 or later and Playwright 1.40 or later (a peer dependency, so you choose the version), with Chromium installed.

---

Extracted from [drift-ci](https://github.com/Drift-CI/drift-ci), where it checks all 22 pages of the drift-ci.com app at 390px. MIT licensed.
