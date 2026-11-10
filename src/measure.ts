/**
 * Runs inside the page and returns { overflow, offenders }:
 * - overflow: how far the page scrolls sideways (scrollWidth minus the layout width (clientWidth; innerWidth grows with content in mobile emulation)).
 * - offenders: the first three visible elements whose right edge is past the viewport.
 *
 * An element doesn't count when an ancestor below <body> clips or scrolls it (overflow-x anything but
 * `visible`). A horizontal table scroller or a carousel doesn't move the page; content clipped by the
 * page itself still counts.
 *
 * This is source text, not a function, so that no build step can inject helpers into code Playwright
 * serialises into the page.
 */
export const MEASURE_SOURCE = String.raw`() => {
  const vw = document.documentElement.clientWidth;
  const clipped = (el) => {
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (getComputedStyle(n).overflowX !== 'visible') return true;
    }
    return false;
  };
  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const classes = String(el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 4).map((c) => '.' + c).join('');
    return el.tagName.toLowerCase() + id + classes + '@' + Math.round(el.getBoundingClientRect().right);
  };
  const offenders = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > vw + 1 && !clipped(el);
    })
    .slice(0, 3)
    .map(describe);
  return { overflow: document.documentElement.scrollWidth - vw, offenders };
}`;
