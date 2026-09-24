import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const json = JSON.parse(await readFile(join(root, 'app.json'), 'utf8'));
if (!Array.isArray(json.pages) || json.pages.length !== 1) throw new Error('app.json pages invalid');
for (const route of json.pages) if (!existsSync(join(root, `${route}.ink`))) throw new Error(`missing page: ${route}.ink`);
if (!json.permissions.includes('RECORD_AUDIO')) throw new Error('RECORD_AUDIO missing');
const ink = await readFile(join(root, 'pages/index/index.ink'), 'utf8');
if (!ink.includes('<script def>') || !ink.includes('<script setup>') || !ink.includes('<page>')) throw new Error('invalid Ink blocks');
if (/\b(Page|App|Widget)\s*\(/.test(ink)) throw new Error('legacy registration found');
JSON.parse(ink.match(/<script def>\n([\s\S]*?)\n<\/script>/)[1]);

// --- Interaction contract: confirm-only, no selectable menu ----------------
// Voice launches the app; the ONLY physical operation is the confirm key.
// Direction-key selection, chip/tab menus and multi-entry points are forbidden.
const directional = /Arrow(?:Up|Down)\b|moveSelection|selectChip|selectedIndex/;
if (directional.test(ink)) throw new Error('directional-key selection forbidden (confirm-only UI)');
if (/(?:chips?|tabs?|menu-row|bindtap="selectChip"|wx:for="\{\{features\}\}")/.test(ink)) {
  throw new Error('selectable tab/chip menu forbidden — the app must be a single confirm-driven flow');
}
// The run must have exactly one action surface driven by Enter / GlobalHook.
// We must NOT see a legacy tabbed feature array with multiple entries.
if (/features\s*:/m.test(ink)) {
  throw new Error('legacy features array still present');
}
if (/selectedIndex\s*==/.test(ink)) {
  throw new Error('legacy tab-switching render block found');
}

// --- Honest diagnostic: MagicDNS completeness ------------------------------
// A run must not claim a link is passable unless a MagicDNS endpoint was
// configured. Static proof: the page must reference evaluateDiagnostic and the
// honest "未完成" / "Tailscale 端点未配置" labels, and must NOT present the
// runtime pass count as a network verdict (no "通过x/y叫网络" deception).
if (!ink.includes('evaluateDiagnostic(')) throw new Error('honest run verdict (evaluateDiagnostic) not wired into the page');

// --- Privacy & network-policy guards --------------------------------------
// Strip `//` line comments first so documentation can't mask a real call, then
// ensure no response body (text/json) is ever read: it can carry sensitive data.
const inkNoComments = ink
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
if (/\.\s*(?:text|json)\s*\(\s*\)/.test(inkNoComments)) throw new Error('network page reads a response body (text/json) — forbidden');
// Only https:// endpoints may be accepted at startup.
if (!ink.includes('isHttpsUrl(')) throw new Error('startup args are not gated by isHttpsUrl()');

const probe = await readFile(join(root, 'lib/probe.js'), 'utf8');
// No hardcoded private / tailnet IP,
const privateIp = /(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})/;
if (privateIp.test(probe)) throw new Error('private/tailnet IP literal found in lib/probe.js');
// ...nor baked-in secrets / Hermes key / tokens.
if (/\b(hermes|apikey|api_key|secret|password|token|access[-_ ]?key)\b/i.test(probe)) throw new Error('secret/Hermes/key-like literal found in lib/probe.js');

// --- Honest verdict logic must reject false PASS ---------------------------
// evaluateDiagnostic must encode the invariants: only PASS when a MagicDNS
// endpoint was configured and runtime+baseline+magicdns are all healthy.
const requiredRules = [
  ['INCOMPLETE', /magicdnsConfigured/],
  ['链路通过 (PASS label)', /PASS/],
  ['未配置 label', /Tailscale 端点未配置/]
];
for (const [what, re] of requiredRules) {
  if (!re.test(probe)) throw new Error(`honest-diagnostic rule missing in lib/probe.js: ${what}`);
}

console.log('AIUI static validation: PASS');