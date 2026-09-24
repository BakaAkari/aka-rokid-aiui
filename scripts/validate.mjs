// Root-level structural validation for the monorepo.
// Ensures every agent directory is self-contained and structurally sound,
// without importing any agent code. Shared cross-agent checks live here.
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const agentsDir = join(root, 'agents');

const REQUIRED_AGENT_FILES = [
  'app.json',
  'app.js',
  'package.json',
  'AGENTS.md',
  'README.md',
  '.aixignore'
];

async function listAgents() {
  if (!existsSync(agentsDir)) return [];
  const entries = await readdir(agentsDir, { withFileTypes: true });
  const dirs = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      const p = join(agentsDir, e.name);
      const s = await stat(p);
      if (s.isDirectory()) dirs.push(e.name);
    }
  }
  return dirs.sort();
}

function error(msg) {
  throw new Error(`[root-validate] ${msg}`);
}

async function validateAgent(name) {
  const agentRoot = join(agentsDir, name);
  for (const f of REQUIRED_AGENT_FILES) {
    if (!existsSync(join(agentRoot, f))) error(`agent "${name}" is missing required file: ${f}`);
  }

  const appJson = JSON.parse(await readFile(join(agentRoot, 'app.json'), 'utf8'));
  if (!Array.isArray(appJson.pages) || appJson.pages.length < 1) {
    error(`agent "${name}" app.json has no pages`);
  }
  for (const route of appJson.pages) {
    if (!existsSync(join(agentRoot, `${route}.ink`))) {
      error(`agent "${name}" missing page: ${route}.ink`);
    }
  }

  const pkg = JSON.parse(await readFile(join(agentRoot, 'package.json'), 'utf8'));
  for (const script of ['test', 'validate']) {
    if (typeof pkg.scripts !== 'object' || typeof pkg.scripts[script] !== 'string') {
      error(`agent "${name}" package.json is missing the "${script}" script`);
    }
  }
  if (!pkg.type || pkg.type !== 'module') error(`agent "${name}" package.json must use "type": "module"`);

  // No symlinks allowed out of the agent.
  if (existsSync(join(agentRoot, 'node_modules'))) {
    const nm = await stat(join(agentRoot, 'node_modules'));
    if (nm.isSymbolicLink()) error(`agent "${name}" node_modules must not be a symlink`);
  }
}

async function main() {
  const agents = await listAgents();
  if (agents.length === 0) error('no agents found under agents/');
  for (const a of agents) await validateAgent(a);
  console.log(`[root-validate] OK — validated ${agents.length} agent(s): ${agents.join(', ')}`);
}

await main();