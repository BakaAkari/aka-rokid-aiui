// Version discipline: every agent's package.json version must match its
// AGENTS.md "Version:" and its app.json version (and, when present, the page
// script's `version` literal). Bump only on explicit request.
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const agentsDir = join(root, 'agents');

function fail(msg) { throw new Error(`[check-versions] ${msg}`); }

async function listAgents() {
  if (!existsSync(agentsDir)) return [];
  const entries = await readdir(agentsDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function main() {
  const agents = await listAgents();
  if (agents.length === 0) fail('no agents found');

  for (const name of agents) {
    const dir = join(agentsDir, name);

    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    const pkgVersion = pkg.version;
    if (typeof pkgVersion !== 'string' || pkgVersion.length === 0) fail(`agent "${name}" has no package.json version`);

    if (existsSync(join(dir, 'app.json'))) {
      const appJson = JSON.parse(await readFile(join(dir, 'app.json'), 'utf8'));
      if (appJson.version && appJson.version !== pkgVersion) {
        fail(`agent "${name}" app.json version ${appJson.version} != package.json ${pkgVersion}`);
      }
    }

    if (existsSync(join(dir, 'AGENTS.md'))) {
      const md = await readFile(join(dir, 'AGENTS.md'), 'utf8');
      const m = md.match(/^[\s#*-]*Version\s*[:：]\s*\**\s*([0-9]+\.[0-9]+\.[0-9]+)/im);
      if (m && m[1] !== pkgVersion) {
        fail(`agent "${name}" AGENTS.md version ${m[1]} != package.json ${pkgVersion}`);
      }
    }
  }
  console.log(`[check-versions] OK — ${agents.length} agent(s) in sync`);
}

await main();