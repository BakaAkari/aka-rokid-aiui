import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const agentsDir = join(root, 'agents');

async function listAgents() {
  if (!existsSync(agentsDir)) return [];
  const entries = await readdir(agentsDir, { withFileTypes: true });
  const dirs = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      const s = await stat(join(agentsDir, e.name));
      if (s.isDirectory()) dirs.push(e.name);
    }
  }
  return dirs.sort();
}

const REQUIRED = ['app.json', 'app.js', 'package.json', 'AGENTS.md', 'README.md', '.aixignore', 'pages'];

test('this repo is a self-contained monorepo', async () => {
  assert.ok(existsSync(join(root, 'AGENTS.md')), 'root AGENTS.md must exist');
  assert.ok(existsSync(join(root, 'README.md')), 'root README.md must exist');
  assert.ok(existsSync(join(root, 'agents')), 'agents/ must exist');
  assert.ok(existsSync(join(root, 'scripts')), 'scripts/ must exist');
  assert.ok(existsSync(join(root, 'test')), 'test/ must exist');
  assert.ok(existsSync(join(root, '.github')), '.github/ must exist');
});

test('every agent is self-contained and Studio-importable', async () => {
  const agents = await listAgents();
  assert.ok(agents.length >= 1, 'at least one agent must exist');
  for (const name of agents) {
    const dir = join(agentsDir, name);
    for (const f of REQUIRED) {
      assert.ok(existsSync(join(dir, f)), `agent ${name} missing ${f}`);
    }
    const appJson = JSON.parse(await readFile(join(dir, 'app.json'), 'utf8'));
    assert.ok(Array.isArray(appJson.pages) && appJson.pages.length >= 1, `${name} has pages`);
    for (const route of appJson.pages) {
      assert.ok(existsSync(join(dir, `${route}.ink`)), `${name} missing page ${route}.ink`);
    }
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.type, 'module', `${name} must be ESM`);
    assert.ok(pkg.scripts && pkg.scripts.test, `${name} must define test script`);
    assert.ok(pkg.scripts && pkg.scripts.validate, `${name} must define validate script`);
  }
});

test('version discipline: agents carry a semver in package.json', async () => {
  for (const name of await listAgents()) {
    const pkg = JSON.parse(await readFile(join(agentsDir, name, 'package.json'), 'utf8'));
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/, `${name} must have a semver version`);
  }
});