// Runs inside a test page built by check-screens.mjs, after load and fonts.
// Expects window.__CHECK = { file, frameW, frameH, existing: [..dc.html files..] }.
// Writes a JSON report into a pre element with the id check-report.
(async function () {
  const t0 = performance.now();
  const cfg = window.__CHECK || {};
  try { await document.fonts.ready; } catch (e) {}
  const out = { file: cfg.file, frame: { w: cfg.frameW, h: cfg.frameH } };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => {
    const cls = (el.className && el.className.baseVal === undefined ? el.className : '').toString().trim().split(/\s+/).slice(0, 2).join('.');
    const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    return `<${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}> "${txt}"`;
  };
  // Screen-reader-only text (1px boxes) is clipped on purpose: skip it.
  const srOnly = (el) => el.clientWidth <= 1 || el.clientHeight <= 1;
  // A layer is the nearest dialog or fixed, sticky, or z-indexed absolute ancestor.
  // Overlaps across layers (a dialog over its page) are intended, so only same-layer overlaps count.
  const layerOf = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (n.getAttribute('role') === 'dialog' || n.getAttribute('aria-modal') || cs.position === 'fixed' || cs.position === 'sticky' || (cs.position === 'absolute' && cs.zIndex !== 'auto')) return n;
    }
    return document.body;
  };
  const root = document.querySelector('#screen-root') || document.body;
  const all = [...root.querySelectorAll('*')].filter(el => !(el instanceof SVGElement) || el.tagName === 'svg');

  // 1. Height: where the visible content really ends.
  // The screen's own wrapper often has a fixed height copied from the frame guess, so free it first.
  const wrap = root.firstElementChild;
  const saved = wrap ? wrap.getAttribute('style') : null;
  if (wrap) wrap.style.height = 'auto';
  let bottom = 0;
  for (const el of all) { if (!visible(el)) continue; const b = el.getBoundingClientRect().bottom + scrollY; if (b > bottom) bottom = b; }
  if (wrap) wrap.setAttribute('style', saved || '');
  const dialogs = [...document.querySelectorAll('[role=dialog],[aria-modal]')].filter(visible).map(d => {
    const r = d.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), fitsFrame: r.bottom <= cfg.frameH, innerScroll: d.scrollHeight > d.clientHeight + 1 };
  });
  out.height = { frameH: cfg.frameH, contentBottom: Math.round(bottom), dialogs };

  // 2. Clipped or overflowing text.
  const clipped = [];
  for (const el of all) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const hidesX = /(hidden|clip)/.test(cs.overflowX), hidesY = /(hidden|clip)/.test(cs.overflowY);
    const ell = cs.textOverflow === 'ellipsis';
    const lineClamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
    if (!hidesX && !hidesY && !ell && !lineClamp) continue;
    const text = (el.innerText || '').trim();
    if (!text || srOnly(el)) continue;
    const ox = hidesX && el.scrollWidth > el.clientWidth + 1;
    const oy = hidesY && el.scrollHeight > el.clientHeight + 1;
    if (ox || oy) clipped.push({ el: label(el), kind: ell && ox ? 'ellipsis' : lineClamp && oy ? 'line-clamp' : 'clipped' });
  }
  const offRight = [];
  for (const el of all) { if (!visible(el)) continue; const r = el.getBoundingClientRect(); if (r.right > innerWidth + 1 && (el.innerText || '').trim()) offRight.push(label(el)); }
  out.clipped = clipped;
  out.offRight = offRight.slice(0, 10);

  // 3. Overlapping text, within the same layer.
  const textEls = all.filter(el => visible(el) && !srOnly(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  // Clip each text box to any ancestor that hides overflow (ellipsis text spills past its box otherwise).
  const clipRect = (el, r) => {
    let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(hidden|clip)/.test(cs.overflowX + cs.overflowY)) { const c = n.getBoundingClientRect(); L = Math.max(L, c.left); T = Math.max(T, c.top); R = Math.min(R, c.right); B = Math.min(B, c.bottom); }
    }
    return { left: L, top: T, right: R, bottom: B };
  };
  const rects = textEls.map(el => { const rg = document.createRange(); rg.selectNodeContents(el); return clipRect(el, rg.getBoundingClientRect()); });
  const layers = textEls.map(layerOf);
  const overlaps = [];
  for (let i = 0; i < textEls.length; i++) for (let j = i + 1; j < textEls.length; j++) {
    const a = textEls[i], b = textEls[j];
    if (a.contains(b) || b.contains(a) || layers[i] !== layers[j]) continue;
    const A = rects[i], B = rects[j];
    const w = Math.min(A.right, B.right) - Math.max(A.left, B.left);
    const h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    if (w > 2 && h > 2) overlaps.push({ a: label(a), b: label(b) });
  }
  out.overlaps = overlaps;

  // 4. Links to screens that don't exist.
  const existing = new Set(cfg.existing || []);
  const dcLinks = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /\.dc\.html(\?|#|$)/.test(h));
  out.brokenLinks = [...new Set(dcLinks.filter(h => !existing.has(h.split(/[?#]/)[0].replace(/^\.?\//, ''))))];
  out.checkMs = Math.round(performance.now() - t0);

  const pre = document.createElement('pre');
  pre.id = 'check-report';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
