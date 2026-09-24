import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const json = JSON.parse(await readFile(join(root, 'app.json'), 'utf8'));
if (!Array.isArray(json.pages) || json.pages.length !== 1) throw new Error('app.json pages invalid');
for (const route of json.pages) if (!existsSync(join(root, `${route}.ink`))) throw new Error(`missing page: ${route}.ink`);
if (!json.permissions.includes('CAMERA')) throw new Error('CAMERA permission missing in app.json');
const ink = await readFile(join(root, 'pages/index/index.ink'), 'utf8');
if (!ink.includes('<script def>') || !ink.includes('<script setup>') || !ink.includes('<page>')) throw new Error('invalid Ink blocks');
if (/\b(Page|App|Widget)\s*\(/.test(ink)) throw new Error('legacy registration found');
JSON.parse(ink.match(/<script def>\n([\s\S]*?)\n<\/script>/)[1]);

// --- Interaction contract: confirm-only, no selectable menu ----------------
// Voice launches the app; the ONLY physical operation is the confirm key.
const directional = /Arrow(?:Up|Down)\b|moveSelection|selectChip|selectedIndex/;
if (directional.test(ink)) throw new Error('directional-key selection forbidden (confirm-only UI)');
if (/(?:chips?|tabs?|menu-row|bindtap="selectChip"|wx:for="\{\{features\}\}")/.test(ink)) {
  throw new Error('selectable tab/chip menu forbidden — must be a single confirm-driven flow');
}
if (/features\s*:/m.test(ink)) throw new Error('legacy features array still present');
if (/selectedIndex\s*==/.test(ink)) throw new Error('legacy tab-switching render block found');
if (!ink.includes('onConfirm')) throw new Error('confirm key handler not wired');
if (!ink.includes("code === 'Enter'")) throw new Error('Enter/GlobalHook not treated as confirm');

// --- Honest prototype: never claims real combat / identity / health --------
// The app must ONLY detect camera availability + visual state, and must label
// itself a prototype. It must NOT claim to judge human combat power, identity,
// or danger. It must not echo photo bytes to logs/UI.
const lib = await readFile(join(root, 'lib/detector.js'), 'utf8');
const libAndInk = lib + '\n' + ink;

// Prototype label must be visible (on-screen and in metadata).
if (!ink.includes('PROTOTYPE') && !ink.includes('原型')) {
  throw new Error('prototype is not self-labelled on screen (PROTOTYPE/原型)');
}
// The honest PASS must hinge on a live video track.
if (!lib.includes('liveVideo') || !lib.includes('apiPresent')) {
  throw new Error('camera availability must be gated on liveVideo + apiPresent');
}
// No real capability claims for combat power / judgement. The app name
// "战斗力检测器" is permitted, but it must never claim to OUTPUT a combat-power
// verdict, score, or rating (real or implied), never judge identity / health /
// danger, and never reference a human body. Negative disclaimer sentences
// (e.g. "不作...判断") are allowed; only affirmative output claims are rejected.
if (/(战斗力(数值|评分|等级|结果|区间)|战力(评分|数值|等级|结果|计算))/.test(libAndInk)) {
  throw new Error('forbidden combat-power output claim found — prototype must not judge these');
}
if (/(危险(判断|评估)|身份(识别|判断)|被检测人物|识别(生|手)物|人体(识别|检测|分析|骨骼)|战斗力检测模块|战力分析(引擎|模块))/.test(libAndInk)) {
  throw new Error('forbidden identity/health/danger judgement wording found — prototype must not judge these');
}
// Never persist or upload photo bytes: no storage.set, no network POST of an image,
// no base64 echo of a photo.
if (/wx\.setStorage|storage\.set|navigator\.sendBeacon|fetch\([\s\S]*?\{[\s\S]*?body/i.test(libAndInk)) {
  throw new Error('photo/visual bytes must not be persisted or uploaded');
}

// --- Privacy & secret guards ----------------------------------------------
const privateIp = /(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})/;
if (privateIp.test(libAndInk)) throw new Error('private/tailnet IP literal found');
if (/\b(hermes|apikey|api_key|secret|password|token|access[-_ ]?key)\b/i.test(libAndInk)) {
  throw new Error('secret/Hermes/key-like literal found');
}

console.log('AIUI combat-power-detector static validation: PASS');