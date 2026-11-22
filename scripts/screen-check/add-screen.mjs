#!/usr/bin/env node
// Add one screen to a canvas, check it, and set its height. One command per screen.
//
// A designer agent writes the screen file first, then runs this, then publishes.
// This script does the steps in between:
//   1. adds the screen to canvas.json (or updates it), and adds its page if new
//   2. runs the screen check (check-screens.mjs)
//   3. reads the result
//   4. sets the suggested height in canvas.json
//   5. sets the same height in the screen file
//
// It never publishes, and it never changes what a screen looks like.
//
// Usage:
//   node add-screen.mjs <canvas project folder> <Screen.dc.html> --w <width> [options]
//
//   --w <px>          frame width. Needed for a new screen.
//   --h <px>          first guess at the height (default: the screen's own preview height, or 900)
//   --title <text>    the board title (default: the file name without .dc.html)
//   --page <id>       the page id (default: from the file name. Baseline-* -> baseline,
//                     *-r2 -> round-2, anything else -> round-1)
//   --page-name <t>   the page's name, if this adds a new page (default: "Round 2", "Baseline", or the id)
//   --x <px> --y <px> where to put it (default y: 0. default x: right of the last screen in that row)
//   --gap <px>        space between screens in a row (default 80)
//   --expand <mode>   like "fill", for web pages
//   --interactive     set is_interactive. Only for screens with working links.
//   --ds <folder>     local copy of the design system's CSS and fonts. Needed for the check.
//   --no-check        only add the screen. Use when the design system runs live on the canvas.
//   --screenshot      also save a PNG, for a closer look
//
// A screen already in canvas.json keeps its place and settings. Only the options you pass change.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const USAGE = 'Usage: node add-screen.mjs <canvas project folder> <Screen.dc.html> --w <width> [--h n] [--title t] [--page id] [--x n] [--y n] [--expand fill] [--interactive] [--ds folder | --no-check] [--screenshot]';
const fail = msg => { console.error(msg); process.exit(2); };

const args = process.argv.slice(2);
const opt = { gap: 80 };
const positional = [];
const VALUE_FLAGS = ['w', 'h', 'x', 'y', 'gap', 'title', 'page', 'page-name', 'expand', 'ds'];
const NUMBER_FLAGS = ['w', 'h', 'x', 'y', 'gap'];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--interactive') opt.interactive = true;
  else if (a === '--no-check') opt.noCheck = true;
  else if (a === '--screenshot') opt.screenshot = true;
  else if (a.startsWith('--') && VALUE_FLAGS.includes(a.slice(2))) {
    const key = a.slice(2);
    const value = args[++i];
    if (value === undefined) fail(`${a} needs a value.\n${USAGE}`);
    if (NUMBER_FLAGS.includes(key)) {
      if (!/^-?\d+$/.test(value)) fail(`${a} must be a whole number, got "${value}".`);
      opt[key] = Number(value);
    } else opt[key] = value;
  } else if (a.startsWith('--')) fail(`Unknown option ${a}.\n${USAGE}`);
  else positional.push(a);
}
if (positional.length !== 2) fail(USAGE);

const dir = path.resolve(positional[0]);
const file = path.basename(positional[1]);
const canvasPath = path.join(dir, 'canvas.json');
const screenPath = path.join(dir, file);
if (!file.endsWith('.dc.html')) fail(`${file} is not a .dc.html screen file.`);
if (!fs.existsSync(canvasPath)) fail(`No canvas.json in ${dir}.`);
if (!fs.existsSync(screenPath)) fail(`${file} is not in ${dir}. Write the screen file first.`);
if (!opt.noCheck && !opt.ds) fail('Pass --ds <design system folder> for the check, or --no-check to skip it.');

const readCanvas = () => JSON.parse(fs.readFileSync(canvasPath, 'utf8'));
const writeCanvas = c => fs.writeFileSync(canvasPath, JSON.stringify(c, null, 2) + '\n');

// The screen file keeps its own size in data-props: {"$preview":{"width":1440,"height":900}}.
const PREVIEW = /("\$preview"\s*:\s*\{[^}]*?"height"\s*:\s*)(\d+)/;
const previewHeight = src => { const m = src.match(PREVIEW); return m ? Number(m[2]) : null; };

// 1. Add the screen to canvas.json.
const canvas = readCanvas();
canvas.boards = canvas.boards || {};
canvas.order = canvas.order || [];
const isNew = !canvas.boards[file];
const board = canvas.boards[file] || {};

const round = (file.match(/-r(\d+)\.dc\.html$/) || [])[1];
const defaultPage = file.startsWith('Baseline-') ? 'baseline' : `round-${round || 1}`;
if (isNew && opt.w === undefined) fail(`${file} is new, so pass --w <width>.`);

if (opt.w !== undefined) board.w = opt.w;
if (opt.h !== undefined) board.h = opt.h;
else if (isNew) board.h = previewHeight(fs.readFileSync(screenPath, 'utf8')) || 900;
if (opt.title !== undefined) board.title = opt.title;
else if (isNew) board.title = file.replace(/\.dc\.html$/, '');
if (opt.page !== undefined) board.page = opt.page;
else if (isNew) board.page = defaultPage;
if (opt.expand !== undefined) board.expand = opt.expand;
if (opt.interactive) board.is_interactive = true;
if (opt.y !== undefined) board.y = opt.y;
else if (isNew) board.y = 0;
if (opt.x !== undefined) board.x = opt.x;
else if (isNew) {
  // Put it to the right of the last screen in the same row of the same page.
  const row = Object.entries(canvas.boards).filter(([name, b]) => name !== file && b.page === board.page && b.y === board.y);
  board.x = row.length ? Math.max(...row.map(([, b]) => (b.x || 0) + (b.w || 0))) + opt.gap : 0;
}
canvas.boards[file] = board;
if (!canvas.order.includes(file)) canvas.order.push(file);

let addedPage = null;
if (Array.isArray(canvas.pages) && !canvas.pages.some(p => p.id === board.page)) {
  const m = board.page.match(/^round-(\d+)$/);
  const name = opt['page-name'] || (m ? `Round ${m[1]}` : board.page === 'baseline' ? 'Baseline' : board.page);
  canvas.pages.push({ id: board.page, name });
  addedPage = name;
}
writeCanvas(canvas);

const placed = `${isNew ? 'added' : 'updated'} on page ${board.page} at x ${board.x}, y ${board.y}, ${board.w}×${board.h}`;
console.log(`${file}: ${placed}${addedPage ? ` (new page "${addedPage}")` : ''}`);

if (opt.noCheck) {
  console.log('Check skipped (--no-check). The screen is ready.');
  process.exit(0);
}

// 2. Run the screen check on this one screen.
const outDir = path.join(dir, '..', 'check');
const checkArgs = [path.join(here, 'check-screens.mjs'), dir, '--ds', opt.ds, '--out', outDir];
if (opt.screenshot) checkArgs.push('--screenshot');
checkArgs.push(file);
const run = spawnSync(process.execPath, checkArgs, { encoding: 'utf8' });
if (run.status === 3) {
  console.log('No Chrome found, so the check was skipped. Note that in canvas.md. The screen is ready.');
  process.exit(0);
}
// 3. Show the result. Drop the "Checked 1 screen(s)" footer.
const lines = (run.stdout || '').split('\n').filter(l => l.trim() && !l.startsWith('Checked '));
if (lines.length) console.log(lines.join('\n'));
if (run.status !== 0) {
  console.log(`The check stopped with an error: ${(run.stderr || '').trim().split('\n')[0] || `exit code ${run.status}`}`);
  process.exit(1);
}

let report = null;
try {
  report = JSON.parse(fs.readFileSync(path.join(outDir, 'report.json'), 'utf8')).find(r => r.file === file);
} catch (e) { /* no report: handled below */ }
if (!report) {
  console.log('No height was set, because the check gave no result for this screen. Fix what it lists above, if anything.');
  process.exit(0);
}

// 4 and 5. Set the suggested height, in canvas.json and in the screen file.
// Same rule as the check: leave a frame that is within 40px, or a dialog that fits.
const oldH = board.h;
const newH = report.suggestedH;
if (typeof newH !== 'number' || Math.abs(newH - oldH) <= 40) {
  console.log(`Height stays ${oldH}.`);
} else {
  const fresh = readCanvas();
  fresh.boards[file].h = newH;
  writeCanvas(fresh);

  let src = fs.readFileSync(screenPath, 'utf8');
  const changed = [];
  if (PREVIEW.test(src)) {
    src = src.replace(PREVIEW, `$1${newH}`);
    changed.push('preview size');
  }
  // A wrapper height copied from the old frame guess: a height or min-height of exactly the old value.
  const fixed = new RegExp(`((?:min-)?height:\\s*)${oldH}px`, 'g');
  const hits = (src.match(fixed) || []).length;
  if (hits) {
    src = src.replace(fixed, `$1${newH}px`);
    changed.push(`${hits} fixed height${hits > 1 ? 's' : ''}`);
  }
  if (changed.length) fs.writeFileSync(screenPath, src);
  console.log(`Height set: ${oldH} → ${newH} in canvas.json${changed.length ? `, and in the screen file (${changed.join(', ')})` : '. The screen file had no fixed height to change'}.`);
}

const toFix = [];
if (report.brokenLinks.length) toFix.push('broken links');
if (report.overlaps.length) toFix.push('overlapping text');
if (report.offRight.length) toFix.push('text past the right edge');
if (report.clipped.length) toFix.push('cut-off text (fix only if it hides something needed)');
console.log(toFix.length ? `Still yours to fix by hand: ${toFix.join(', ')}. Don't run this again on this screen.` : 'Nothing else to fix. The screen is ready.');
