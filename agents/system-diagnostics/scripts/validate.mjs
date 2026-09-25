import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const json = JSON.parse(await readFile(join(root, 'app.json'), 'utf8'));
if (!Array.isArray(json.pages) || json.pages.length !== 1) throw new Error('app.json pages invalid');
for (const route of json.pages) if (!existsSync(join(root, `${route}.ink`))) throw new Error(`missing page: ${route}.ink`);

// --- Permissions declared and purposeful ------------------------------------
for (const perm of ['RECORD_AUDIO', 'CAMERA', 'INTERNET']) {
  if (!json.permissions.includes(perm)) throw new Error(`${perm} permission missing in app.json`);
}
const ink = await readFile(join(root, 'pages/index/index.ink'), 'utf8');
if (!ink.includes('<script def>') || !ink.includes('<script setup>') || !ink.includes('<page>')) throw new Error('invalid Ink blocks');
if (/\b(Page|App|Widget)\s*\(/.test(ink)) throw new Error('legacy registration found');
JSON.parse(ink.match(/<script def>\n([\s\S]*?)\n<\/script>/)[1]);
// Purpose of each declared permission must be evident in the page source.
if (!/RECORD_AUDIO|SpeechRecognition/.test(ink)) throw new Error('RECORD_AUDIO usage not evident in page');
if (!/getUserMedia\(\{\s*video|CAMERA/i.test(ink)) throw new Error('CAMERA usage not evident in page');
if (!/fetch\(|baseline/i.test(ink)) throw new Error('INTERNET/probe usage not evident in page');

// --- Interaction contract: confirm-only, no selectable menu ----------------
const directional = /Arrow(?:Up|Down)\b|moveSelection|selectChip|selectedIndex/;
if (directional.test(ink)) throw new Error('directional-key selection forbidden (confirm-only UI)');
if (/(?:\bchips?\b|\btabs?\b|menu-row|bindtap="selectChip"|wx:for="\{\{features\}\}")/.test(ink)) {
  throw new Error('selectable tab/chip menu forbidden — must be a single confirm-driven flow');
}
if (/features\s*:/m.test(ink)) throw new Error('legacy features array still present');
if (/selectedIndex\s*==/.test(ink)) throw new Error('legacy tab-switching render block found');
if (!ink.includes('onConfirm')) throw new Error('confirm key handler not wired');
if (!/===\s*'Enter'/.test(ink) || !/===\s*'GlobalHook'/.test(ink)) throw new Error('Enter/GlobalHook not treated as confirm');

// --- Speech: final results must use result.isFinal --------------------------
const lib = await readFile(join(root, 'lib/detector.js'), 'utf8');
if (!lib.includes('result.isFinal') && !lib.includes('isFinal')) {
  throw new Error('speech final result must be gated on result.isFinal');
}
if (!ink.includes('extractSpeechResult')) throw new Error('speech result extraction not wired into the page');
if (!ink.includes('CapabilityCatalog')) throw new Error('complete capability catalog not wired into the page');
if (!ink.includes('Accelerometer') || !ink.includes('Gyroscope') || !ink.includes('AbsoluteOrientationSensor')) {
  throw new Error('official IMU sensor probes missing');
}

// --- Honest system test: never claims real combat / identity / health ------
// The app must ONLY report device-capability diagnostic outcomes and must
// identify itself as a system/diagnostic test. It must not claim to judge human
// combat power, identity, health, or danger, and must not echo photo bytes /
// transcript to logs/UI.
const libAndInk = lib + '\n' + ink;

// The on-screen UI must self-label as a system test / device diagnostic.
if (!/系统测试|设备能力诊断|SYSTEM TEST|DIAGNOSTIC/.test(ink)) {
  throw new Error('system-test is not self-labelled on screen (系统测试 / 设备能力诊断)');
}
// Camera honesty must hinge on a live video track.
if (!lib.includes('liveVideo') || !lib.includes('apiPresent')) {
  throw new Error('camera availability must be gated on liveVideo + apiPresent');
}
// The overall verdict vocabulary must be present and honest.
if (!ink.includes('summaryText') || !ink.includes('已执行')) throw new Error('evidence-level coverage summary missing');
if (/全部核心能力已通过/.test(libAndInk)) throw new Error('misleading all-core-capabilities verdict found');
// No real capability claims for combat power / judgement. The system test must
// never claim to OUTPUT a combat-power verdict, score, or rating, never judge
// identity / health / danger, and never reference a human body. Negative
// disclaimer sentences are allowed; only affirmative output claims are rejected.
if (/(战斗力(数值|评分|等级|结果|区间)|战力(评分|数值|等级|结果|计算))/.test(libAndInk)) {
  throw new Error('forbidden combat-power output claim found — system test must not judge these');
}
if (/(危险(判断|评估)|身份(识别|判断)|被检测人物|识别(生|手)物|人体(识别|检测|分析|骨骼)|战斗力检测模块|战力分析(引擎|模块)|所有硬件(已通过|通过)|硬件全(通过|正常))/.test(libAndInk)) {
  throw new Error('forbidden identity/health/danger/hardware-pass claim found — system test must not judge these');
}
// Normalise comments out of both engineering code + page so documentation
// cannot mask (or create a false positive for) a real data-echo pattern.
const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .trim();
const codeNoComments = stripComments(`${lib}\n${ink}`);

// Photo bytes / transcript must never be uploaded. The capability baseline may
// write only fixed, non-sensitive sentinel values to its own diagnostic keys.
if (/navigator\.sendBeacon|fetch\([\s\S]*?\{[\s\S]*?body/i.test(codeNoComments)) {
  throw new Error('photo/visual/transcript bytes must not be uploaded');
}
if (/localStorage\.setItem\((?!k,\s*'1')|\.write\((?!'ok')/.test(codeNoComments)) {
  throw new Error('storage probe may write only fixed non-sensitive sentinels');
}

// --- Privacy & network-policy guards --------------------------------------
// Strip `//` line comments so docs can't mask a real call; no response body read.
const inkNoComments = ink
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
if (/\.\s*(?:text|json)\s*\(\s*\)/.test(inkNoComments)) throw new Error('the diagnostic reads a response body (text/json) — forbidden');

const privateIp = /(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})/;
if (privateIp.test(libAndInk)) throw new Error('private/tailnet IP literal found');
if (/\b(hermes|apikey|api_key|secret|password|token|access[-_ ]?key)\b/i.test(libAndInk)) {
  throw new Error('secret/Hermes/key-like literal found');
}
// The live transcript must never be displayed/stacked on screen: the page may
// only render a short status, not the recognised text.
if (/transcript\s*[:=]|\{\{\s*transcript/i.test(inkNoComments)) {
  throw new Error('full transcript must not be bound to the on-screen UI');
}

console.log('AIUI system-diagnostics static validation: PASS');