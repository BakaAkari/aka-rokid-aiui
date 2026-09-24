// Recursively scan the repo (excluding .git, node_modules, lockfiles, zips) for
// secrets: key-like literals, private / tailnet IPs, and credential-ish names.
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'artifacts', '.cache', 'dist', 'secrets']);
const IGNORE_FILES = new Set(['.aixignore', 'package-lock.json', 'package.json']);

const KEY_PATTERNS = [
  // Very high confidence secret material.
  { re: /(?:BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/, label: 'credential material' },
  // `= <key>` style assignments that look like tokens (avoid matching code identifiers).
  { re: /\b(?:api[_-]?key|secret|token|passwd|password|access[_-]?key|hermes[_-]?key)\b\s*[:=]\s*['"][^'"]{8,}['"]/i, label: 'secret-like assignment' },
  // Hardcoded private / tailnet IPv4.
  {
    re: /(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})/,
    label: 'private / tailnet IP literal'
  }
];

const TEXT_EXT = new Set(['.js', '.mjs', '.json', '.md', '.ink', '.wxss', '.wxml', '.ts', '.jsx', '.tsx', '.yml', '.yaml', '.txt', '.cjs', '.html', '.css']);

async function walk(dir) {
  const found = [];
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return found; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (IGNORE_DIRS.has(e.name)) continue;
    const s = await stat(p);
    if (s.isDirectory()) {
      found.push(...await walk(p));
      continue;
    }
    const ext = e.name.includes('.') ? e.name.split('.').pop() : '';
    if (!TEXT_EXT.has(ext) || IGNORE_FILES.has(e.name)) continue;
    let text = '';
    try { text = await readFile(p, 'utf8'); } catch { continue; }
    for (const { re, label } of KEY_PATTERNS) {
      if (re.test(text)) found.push({ file: p, label });
    }
  }
  return found;
}

const hits = await walk(root);
if (hits.length > 0) {
  const unique = [...new Map(hits.map((h) => [h.file, h.label])).entries()];
  for (const [file, label] of unique) console.error(`[check-secrets] ${label}: ${file}`);
  throw new Error(`[check-secrets] FAIL — ${unique.length} suspected secret/policy violation(s)`);
}
console.log('[check-secrets] OK — no secrets or private IPs found');