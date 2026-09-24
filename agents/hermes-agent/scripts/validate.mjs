import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const json = JSON.parse(await readFile(join(root, 'app.json'), 'utf8'));
if (!Array.isArray(json.pages) || json.pages.length !== 1) throw new Error('app.json pages invalid');
for (const route of json.pages) if (!existsSync(join(root, `${route}.ink`))) throw new Error(`missing page: ${route}.ink`);

const ink = await readFile(join(root, 'pages/index/index.ink'), 'utf8');
if (!ink.includes('<script def>') || !ink.includes('<script setup>') || !ink.includes('<page>')) throw new Error('invalid Ink blocks');
if (/\b(Page|App|Widget)\s*\(/.test(ink)) throw new Error('legacy registration found');
JSON.parse(ink.match(/<script def>\n([\s\S]*?)\n<\/script>/)[1]);

// --- Interaction contract: confirm-only, no selectable menu ----------------
const directional = /Arrow(?:Up|Down)\b|moveSelection|selectChip|selectedIndex/;
if (directional.test(ink)) throw new Error('directional-key selection forbidden (confirm-only UI)');
if (/(?:chips?|tabs?|menu-row|bindtap="selectChip"|wx:for="\{\{features\}\}")/.test(ink)) {
  throw new Error('selectable tab/chip menu forbidden — must be a single confirm-driven flow');
}
if (/features\s*:/m.test(ink)) throw new Error('legacy features array still present');
if (/selectedIndex\s*==/.test(ink)) throw new Error('legacy tab-switching render block found');
if (!ink.includes('onConfirm')) throw new Error('confirm key handler not wired');
if (!ink.includes("code === 'Enter'")) throw new Error('Enter/GlobalHook not treated as confirm');

// --- Honest skeleton: must NOT claim Hermes is connected --------------------
// The skeleton must self-label as not-yet-connected and must never claim real
// on-glasses inference, an endpoint, or a model call.
const lib = await readFile(join(root, 'lib/status.js'), 'utf8');
const libAndInk = lib + '\n' + ink;

// The honest "尚未接入" verdict must be present, and the evaluator must never
// return a connected/configured status.
if (!lib.includes('NOT_CONNECTED')) throw new Error('honest NOT_CONNECTED status missing in lib/status.js');
if (!lib.includes('Hermes 尚未接入')) throw new Error('honest "Hermes 尚未接入" label missing');
if (!ink.includes('尚未接入')) throw new Error('on-screen UI must show "Hermes 尚未接入"');
if (!lib.includes('return false') || !lib.includes('hermesUsable')) {
  throw new Error('hermesUsable() must not claim a usable Hermes capability');
}
// The skeleton must never fabricate a connection: reject endpoints/auth/model
// calls in the page.
const inkNoComments = ink
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
if (/\.\s*(?:text|json)\s*\(\s*\)/.test(inkNoComments)) throw new Error('skeleton reads a response body — forbidden');

// --- Privacy & secret guards ----------------------------------------------
const privateIp = /(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})/;
if (privateIp.test(libAndInk)) throw new Error('private/tailnet IP literal found');
if (/(?:api[_-]?key|secret|password|access[-_ ]?key)\b\s*[:=]\s*['"][^'"]{8,}['"]/i.test(libAndInk)) {
  throw new Error('secret/key-like literal found');
}

console.log('AIUI hermes-agent static validation: PASS (skeleton, not connected)');