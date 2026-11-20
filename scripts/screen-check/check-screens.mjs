#!/usr/bin/env node
// Measure design screens in headless Chrome before publishing them to a canvas.
//
// For each .dc.html screen it reports:
//   - where the content really ends, and a suggested frame height
//   - clipped or cut-off text
//   - text that overlaps other text
//   - links to screens that don't exist
//
// It never changes a screen or canvas.json. It needs Google Chrome or Chromium. No installs.
//
// Usage:
//   node check-screens.mjs <canvas project folder> --ds <design system folder> [options] [screen.dc.html ...]
//
//   <canvas project folder>  the local folder with canvas.json and the .dc.html files
//   --ds <folder>            a local copy of the design system's CSS and fonts, laid out as on the
//                            canvas (usually a tokens file, component CSS, and fonts).
//                            Every .css file in it is linked, tokens.css first.
//   --round <n>              check only round <n> screens (files ending -r<n>.dc.html; 1 = no suffix)
//   --screenshot             also save a PNG of each screen, for a closer look
//   --out <folder>           where to put test pages and PNGs (default: <canvas project folder>/../check)
//   screens                  specific files to check (default: every screen in canvas.json)
//
// Set CHROME_PATH to use a Chrome that isn't in a standard place.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = { screens: [], screenshot: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--ds') opt.ds = args[++i];
  else if (a === '--round') opt.round = args[++i];
  else if (a === '--out') opt.out = args[++i];
  else if (a === '--screenshot') opt.screenshot = true;
  else if (!opt.dir) opt.dir = a;
  else opt.screens.push(a);
}
if (!opt.dir || !opt.ds) {
  console.error('Usage: node check-screens.mjs <canvas project folder> --ds <design system folder> [--round n] [--screenshot] [--out folder] [screens...]');
  process.exit(2);
}

const dir = path.resolve(opt.dir);
const ds = path.resolve(opt.ds);
const outDir = path.resolve(opt.out || path.join(dir, '..', 'check'));
fs.mkdirSync(outDir, { recursive: true });

// Find Chrome.
const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const chrome = chromeCandidates.find(p => fs.existsSync(p));
if (!chrome) {
  console.error('No Chrome found. Install Google Chrome, or set CHROME_PATH. Skipping the check.');
  process.exit(3);
}

// Link the design system's CSS, tokens first.
const cssFiles = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else if (f.name.endsWith('.css')) cssFiles.push(p);
  }
})(ds);
cssFiles.sort((a, b) => (path.basename(b) === 'tokens.css') - (path.basename(a) === 'tokens.css'));
if (!cssFiles.length) console.warn(`Warning: no .css files in ${ds}. Screens will render unstyled.`);
const cssLinks = cssFiles.map(f => `<link rel="stylesheet" href="${new URL('file://' + f).href}">`).join('\n');

const canvas = JSON.parse(fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8'));
const existing = fs.readdirSync(dir).filter(f => f.endsWith('.dc.html'));
const roundOf = f => { const m = f.match(/-r(\d+)\.dc\.html$/); return m ? m[1] : '1'; };
let screens = opt.screens.length ? opt.screens : Object.keys(canvas.boards || {}).filter(f => f.endsWith('.dc.html'));
if (opt.round) screens = screens.filter(f => roundOf(f) === String(opt.round));
screens = screens.filter(f => !f.startsWith('Baseline-'));
const measure = fs.readFileSync(path.join(here, 'measure.js'), 'utf8');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-check-chrome-'));

function buildPage(file, withCheck) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  const b = (canvas.boards || {})[file] || {};
  const xdc = (src.match(/<x-dc>([\s\S]*?)<\/x-dc>/) || [])[1] || '';
  const helmet = (xdc.match(/<helmet>([\s\S]*?)<\/helmet>/) || [])[1] || '';
  const markup = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  const cfg = { file, frameW: b.w, frameH: b.h, existing };
  const check = withCheck ? `<script>window.__CHECK=${JSON.stringify(cfg)};</script>\n<script>${measure}</script>` : '';
  return { b, html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=${b.w}">
<title>check ${file}</title>
${cssLinks}
${helmet}
</head><body style="margin:0">
<div id="screen-root">${markup}</div>
${check}
</body></html>` };
}

function runChrome(extra, url, w, h) {
  return execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    `--user-data-dir=${profile}`, `--window-size=${w},${h}`, '--virtual-time-budget=5000',
    '--allow-file-access-from-files', ...extra, url,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000, maxBuffer: 64 * 1024 * 1024 });
}

const unescape = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const results = [];
for (const file of screens) {
  if (!fs.existsSync(path.join(dir, file))) { console.log(`${file}: missing file, skipped`); continue; }
  const { b, html } = buildPage(file, true);
  if (!b.w || !b.h) { console.log(`${file}: no frame size in canvas.json, skipped`); continue; }
  const page = path.join(outDir, file.replace('.dc.html', '.check.html'));
  fs.writeFileSync(page, html);
  const winH = Math.max(b.h, 1000);
  let report, lastError;
  // Try twice: a cold Chrome start loading web fonts can time out once.
  for (let attempt = 0; attempt < 2 && !report; attempt++) {
    try {
      const dom = runChrome(['--dump-dom'], 'file://' + page, b.w, winH);
      const all = [...dom.matchAll(/<pre id="check-report">([\s\S]*?)<\/pre>/g)];
      if (!all.length) throw new Error('no report in page');
      report = JSON.parse(unescape(all[all.length - 1][1]));
    } catch (e) { lastError = e; }
  }
  if (!report) {
    console.log(`${file}: check failed (${lastError.message.split('\n')[0]})`);
    continue;
  }
  if (opt.screenshot) {
    const shot = path.join(outDir, file.replace('.dc.html', '.shot.html'));
    fs.writeFileSync(shot, buildPage(file, false).html);
    try {
      runChrome([`--screenshot=${path.join(outDir, file.replace('.dc.html', '.png'))}`], 'file://' + shot, b.w, b.h);
    } catch (e) { console.log(`${file}: screenshot failed`); }
  }
  // Suggest a frame height: content plus 40px. A dialog screen keeps its height if the dialog fits.
  const { contentBottom, dialogs } = report.height;
  const dialogFits = dialogs.length && dialogs.every(d => d.fitsFrame && !d.innerScroll);
  report.suggestedH = dialogFits ? b.h : contentBottom + 40;
  results.push(report);

  const parts = [];
  const diff = report.suggestedH - b.h;
  if (dialogFits) parts.push(`dialog fits the ${b.h}px frame`);
  else if (Math.abs(diff) > 40) parts.push(`frame ${b.h}px → set h to ${report.suggestedH} (${diff > 0 ? 'content is cut off' : `${-diff}px empty`})`);
  else parts.push(`frame ${b.h}px fits`);
  if (report.clipped.length) parts.push(`${report.clipped.length} cut-off text`);
  if (report.offRight.length) parts.push(`${report.offRight.length} past the right edge`);
  if (report.overlaps.length) parts.push(`${report.overlaps.length} overlapping text`);
  if (report.brokenLinks.length) parts.push(`broken links: ${report.brokenLinks.join(', ')}`);
  console.log(`${file}: ${parts.join(' | ')}`);
  for (const c of report.clipped.slice(0, 3)) console.log(`    cut off: ${c.el}`);
  for (const o of report.overlaps.slice(0, 3)) console.log(`    overlap: ${o.a} / ${o.b}`);
}

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 1));
fs.rmSync(profile, { recursive: true, force: true });
console.log(`\nChecked ${results.length} screen(s). Full report: ${path.join(outDir, 'report.json')}`);
