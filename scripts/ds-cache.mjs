#!/usr/bin/env node
// Keep one saved copy of a design system's styles and fonts, shared by every run.
//
// A run needs those files on this computer, for the screen check and the render script.
// Downloading them from Claude Design every run is slow. So the first run saves a copy
// in design-runs/_shared/ds/<design system id>/, with the system's version stamp.
// Later runs reuse it while the stamp matches.
//
// It works for any design system. Nothing here names one. The saved copy is keyed by
// the system's Claude Design link.
//
// This script never downloads anything. Agents download with the Artifact tool.
//
// Usage:
//   node ds-cache.mjs use  <run folder> <design system link> <version stamp>
//   node ds-cache.mjs save <run folder> <design system link> <version stamp> <folder name>
//   node ds-cache.mjs save <run folder> <design system link> <version stamp> --no-styles
//
//   use    Copy the saved copy into <run folder>/render/ds/<folder name>/, if its stamp matches.
//          Prints one line that starts with HIT, KEPT, NO-STYLES, MISS, or STALE.
//   save   Save <run folder>/render/ds/<folder name>/ as the shared copy for this stamp.
//          With --no-styles, record that this system has no styles to load.
//
//   <version stamp>  the version the Artifact tool reports for the design system,
//                    like 1795272168-9a68.
//   <folder name>    the design system's folder on a canvas, like the "acme" in ds/acme/.

import fs from 'node:fs';
import path from 'node:path';

const USAGE = `Usage:
  node ds-cache.mjs use  <run folder> <design system link> <version stamp>
  node ds-cache.mjs save <run folder> <design system link> <version stamp> <folder name | --no-styles>`;
const fail = msg => { console.error(msg); process.exit(2); };

const [command, runArg, link, stamp, last] = process.argv.slice(2);
if (!['use', 'save'].includes(command) || !runArg || !link || !stamp) fail(USAGE);
if (process.argv.length > (command === 'use' ? 6 : 7)) fail(USAGE);

const run = path.resolve(runArg);
if (!fs.existsSync(run) || !fs.statSync(run).isDirectory()) fail(`No run folder at ${run}.`);

// The id is the last part of the link: https://claude.ai/artifact/<id>.
const id = (link.match(/\/artifact\/([A-Za-z0-9_-]{6,})(?:[/?#]|$)/) || [])[1];
if (!id) fail(`Can't read a design system id from "${link}". Pass its Claude Design link.`);
if (!/^[A-Za-z0-9._-]+$/.test(stamp)) fail(`"${stamp}" doesn't look like a version stamp.`);

const shared = path.join(path.dirname(run), '_shared', 'ds', id);
const infoPath = path.join(shared, 'stamp.json');
const filesDir = path.join(shared, 'files');
const readInfo = () => { try { return JSON.parse(fs.readFileSync(infoPath, 'utf8')); } catch (e) { return null; } };

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return n;
}
const hasCss = dir => fs.readdirSync(dir, { withFileTypes: true }).some(entry =>
  entry.isDirectory() ? hasCss(path.join(dir, entry.name)) : entry.name.endsWith('.css'));
const safeFolder = name => /^[A-Za-z0-9._-]+$/.test(name) && name !== '.' && name !== '..';

if (command === 'use') {
  const info = readInfo();
  if (!info) {
    console.log('MISS: no saved copy of this design system yet. Download its styles and fonts, then run "save".');
    process.exit(0);
  }
  if (info.stamp !== stamp) {
    // A run that already has its copy keeps it, so every direction in the run uses the same version.
    const mine = info.folder && path.join(run, 'render', 'ds', info.folder);
    if (mine && fs.existsSync(mine) && countFiles(mine) > 0) {
      console.log(`KEPT: this run already has its copy in ${mine}. The design system has changed since (now ${stamp}), so tell the prompter. The run keeps its copy.`);
      process.exit(0);
    }
    console.log(`STALE: the saved copy is version ${info.stamp}, and the design system is now ${stamp}. Download its styles and fonts again, then run "save".`);
    process.exit(0);
  }
  if (!info.styles) {
    console.log('NO-STYLES: this design system has no styles to load. Nothing to copy, and nothing to download.');
    process.exit(0);
  }
  const dest = path.join(run, 'render', 'ds', info.folder);
  if (fs.existsSync(dest) && countFiles(dest) > 0) {
    console.log(`KEPT: this run already has its copy in ${dest}.`);
    process.exit(0);
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(filesDir, dest, { recursive: true });
  console.log(`HIT: copied ${countFiles(dest)} files to ${dest} (version ${stamp}). No download needed.`);
  process.exit(0);
}

// save
if (!last) fail(USAGE);
fs.mkdirSync(shared, { recursive: true });
const base = { link, stamp, savedAt: new Date().toISOString() };
if (last === '--no-styles') {
  fs.rmSync(filesDir, { recursive: true, force: true });
  fs.writeFileSync(infoPath, JSON.stringify({ ...base, styles: false }, null, 2) + '\n');
  console.log(`Saved: this design system has no styles to load (version ${stamp}). Later runs will skip the download.`);
  process.exit(0);
}
if (!safeFolder(last)) fail(`"${last}" is not a plain folder name. Pass the design system's folder on the canvas, like the "acme" in ds/acme/.`);
const source = path.join(run, 'render', 'ds', last);
if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) fail(`Nothing to save: no folder at ${source}.`);
if (!hasCss(source)) fail(`Nothing to save: ${source} has no .css file. If the design system has no styles, run "save" with --no-styles.`);
fs.rmSync(filesDir, { recursive: true, force: true });
fs.cpSync(source, filesDir, { recursive: true, filter: src => path.basename(src) !== '.DS_Store' });
fs.writeFileSync(infoPath, JSON.stringify({ ...base, styles: true, folder: last }, null, 2) + '\n');
console.log(`Saved ${countFiles(filesDir)} files as the shared copy (version ${stamp}), in ${shared}. Later runs will reuse it.`);
