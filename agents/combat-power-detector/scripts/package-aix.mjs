// Structural checker + safe local source zip for the combat-power-detector agent.
//
// IMPORTANT: This NEVER produces an AIUI Studio `.aix` binary and NEVER uploads.
// A real `.aix` build is owned by AIUI Studio ("Package AIX"). This script only
// confirms the folder is structurally complete and, optionally, writes a plain
// source zip you can inspect locally.
import { readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function fail(msg) { throw new Error(`[package-aix] ${msg}`); }

const appJson = JSON.parse(await readFile(join(root, 'app.json'), 'utf8'));
if (!Array.isArray(appJson.pages) || appJson.pages.length < 1) fail('app.json has no pages');
for (const route of appJson.pages) {
  if (!existsSync(join(root, `${route}.ink`))) fail(`missing page: ${route}.ink`);
}
if (!appJson.permissions || !appJson.permissions.includes('CAMERA')) fail('CAMERA permission missing');
for (const f of ['app.js', 'app.json', 'package.json', 'AGENTS.md', 'README.md', '.aixignore']) {
  if (!existsSync(join(root, f))) fail(`missing required file: ${f}`);
}

console.log('[package-aix] OK — agent structure is complete for Studio import.');
console.log('[package-aix] Note: real .aix packaging is owned by AIUI Studio (Package AIX). Writing a plain source zip only.');

const outDir = join(root, '..', '..', 'artifacts');
await mkdir(outDir, { recursive: true });
const out = join(outDir, 'combat-power-detector-source.zip');
await rm(out, { force: true });
execFileSync('/usr/bin/zip', ['-qr', out, '.', '-x', 'node_modules/*', '.cache/*', 'test/*', 'scripts/*', 'docs/*', 'README.md', '*.zip', '*.aix'], { cwd: root });
console.log(`[package-aix] wrote local source zip: ${out} (not a Studio binary)`);