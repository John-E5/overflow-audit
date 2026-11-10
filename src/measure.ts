/**
 * Runs inside the page and returns { overflow, offenders }:
 * - overflow: how far the page scrolls sideways (scrollWidth minus the layout width (clientWidth; innerWidth grows with content in mobile emulation)).
 * - offenders: up to three visible elements that stick out past the right edge of the page, or past the left edge
 *   on a right-to-left page. Positions are measured from the page's
 *   own box, so the widened layout viewport of mobile emulation doesn't shift them.
 *
 * What doesn't count, because it can't make a phone scroll sideways:
 * - an element that a clipping or scrolling ancestor below <body> contains (overflow-x anything but `visible`).
 *   For absolutely positioned elements only their containing block and its ancestors clip them. A horizontal
 *   table scroller or a carousel doesn't move the page; content clipped by the page itself still counts.
 * - `position: fixed` elements and their contents, such as a closed off-canvas menu, unless a transformed
 *   ancestor makes them scroll with the page.
 * - shapes inside an <svg>; the <svg> element itself is measured.
 * - content to the left of a left-to-right page (or the right of a right-to-left one), which can't be scrolled to.
 *
 * Only the topmost offenders are named: children of an element already named are skipped. Open shadow roots are
 * searched too, and their elements are named after their host, as `host>tag.class@edge`. When no element sticks
 * out but the page still overflows (a long word or URL), the deepest element whose content spills out is named.
 *
 * This is source text, not a function, so that no build step can inject helpers into code Playwright
 * serialises into the page.
 */
export const MEASURE_SOURCE = String.raw`() => {
  const html = document.documentElement;
  const body = document.body;
  const vw = html.clientWidth;
  const rtl = getComputedStyle(html).direction === 'rtl';
  const box = html.getBoundingClientRect();
  const start = rtl ? box.right - vw : box.left;
  const end = start + vw;
  const past = (left, right) => (rtl ? left < start - 1 : right > end + 1);
  const edge = (left, right) => Math.round((rtl ? left : right) - start);

  // The parent in the rendered (flattened) tree: a slot for slotted content, the host for a shadow root's children.
  const up = (n) => n.assignedSlot || n.parentElement || (n.parentNode && n.parentNode.host) || null;
  const isPage = (n) => !n || n === body || n === html;
  // A transform, filter, perspective or containment makes an element the containing block of fixed descendants.
  const holdsFixed = (s) => s.transform !== 'none' || s.perspective !== 'none' || s.filter !== 'none' || /paint|layout|strict|content/.test(s.contain);
  const pinned = (el) => {
    for (let n = el; !isPage(n); n = up(n)) {
      if (getComputedStyle(n).position !== 'fixed') continue;
      let held = false;
      for (let a = up(n); a && a !== html; a = up(a)) if (holdsFixed(getComputedStyle(a))) { held = true; break; }
      if (!held) return true;
    }
    return false;
  };
  const clipped = (el) => {
    let pos = getComputedStyle(el).position;
    for (let n = up(el); !isPage(n); n = up(n)) {
      const s = getComputedStyle(n);
      // Ancestors between a positioned element and its containing block don't clip it.
      if (pos === 'absolute' && s.position === 'static' && !holdsFixed(s)) continue;
      if (pos === 'fixed' && !holdsFixed(s)) continue;
      if (s.overflowX !== 'visible') return true;
      pos = s.position;
    }
    return false;
  };
  const inSvg = (el) => Boolean(el.parentElement && el.parentElement.closest('svg'));
  const counts = (el) => !inSvg(el) && !pinned(el) && !clipped(el);

  const all = [];
  const walk = (scope) => {
    for (const el of scope.querySelectorAll('*')) {
      all.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(body);

  const name = (el) => {
    const id = el.id ? '#' + el.id : '';
    const classes = String(el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 4).map((c) => '.' + c).join('');
    return el.tagName.toLowerCase() + id + classes;
  };
  const describe = (el, at) => {
    let s = name(el) + '@' + at;
    for (let root = el.getRootNode(); root instanceof ShadowRoot; root = root.host.getRootNode()) s = name(root.host) + '>' + s;
    return s;
  };
  const hasAncestorIn = (el, set) => {
    for (let n = up(el); !isPage(n); n = up(n)) if (set.has(n)) return true;
    return false;
  };

  const overflow = html.scrollWidth - vw;
  const sticking = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && past(r.left, r.right) && counts(el);
  });
  const set = new Set(sticking);
  let offenders = sticking.filter((el) => !hasAncestorIn(el, set)).slice(0, 3).map((el) => {
    const r = el.getBoundingClientRect();
    return describe(el, edge(r.left, r.right));
  });

  if (offenders.length === 0 && overflow > 1) {
    // Nothing sticks out, yet the page scrolls: look for content spilling out of its box, like a long word.
    const spills = [];
    for (const el of all) {
      if (el.clientWidth === 0 || el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).overflowX !== 'visible') continue;
      const r = el.getBoundingClientRect();
      const left = rtl ? r.right - el.scrollWidth : r.left;
      const right = rtl ? r.right : r.left + el.scrollWidth;
      if (past(left, right) && counts(el)) spills.push({ el, at: edge(left, right) });
    }
    // The deepest one holds the content; its ancestors only spill because of it.
    const parents = new Set();
    for (const { el } of spills) for (let n = up(el); !isPage(n); n = up(n)) parents.add(n);
    offenders = spills.filter(({ el }) => !parents.has(el)).slice(0, 3).map(({ el, at }) => describe(el, at));
  }

  return { overflow, offenders };
}`;
