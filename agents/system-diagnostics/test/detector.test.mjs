import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EvidenceState, CapabilityCatalog, createResult, summarizeResults, summaryText, safeDeviceInfo, isSensitiveText } from '../lib/catalog.js';
import { withTimeout, extractSpeechResult } from '../lib/detector.js';

test('catalog covers all foundation domains with stable unique ids', () => {
  assert.ok(CapabilityCatalog.length >= 33);
  assert.equal(new Set(CapabilityCatalog.map((x) => x.id)).size, CapabilityCatalog.length);
  const groups = new Set(CapabilityCatalog.map((x) => x.group));
  for (const group of ['运行时','显示交互','音频AI','视觉','传感器','设备信息','连接','网络','存储','原生层']) assert.ok(groups.has(group));
});

test('catalog explicitly covers official AIUI APIs', () => {
  const ids = new Set(CapabilityCatalog.map((x) => x.id));
  for (const id of ['sensor.accelerometer','sensor.gyroscope','sensor.orientation','device.battery','geo.position','bluetooth.availability','vision.barcode','speech.mic','speech.session','audio.synthesis','audio.webaudio','ai.language','camera.live','network.https','network.websocket','network.sse','storage.local','storage.indexeddb','storage.opfs']) assert.ok(ids.has(id), `missing ${id}`);
});

test('evidence summary distinguishes proof levels and never claims all device abilities passed', () => {
  const caps = CapabilityCatalog.slice(0, 6);
  const results = [createResult(caps[0], EvidenceState.VERIFIED),createResult(caps[1], EvidenceState.SURFACE),createResult(caps[2], EvidenceState.UNSUPPORTED),createResult(caps[3], EvidenceState.UNAVAILABLE),createResult(caps[4], EvidenceState.FAILED),createResult(caps[5], EvidenceState.NOT_RUN)];
  const summary = summarizeResults(results);
  assert.equal(summary.total, 6); assert.equal(summary.executed, 5); assert.equal(summary.counts.verified, 1);
  assert.doesNotMatch(summaryText(summary), /全部|所有.*通过/);
});

test('safe device info excludes unique identifiers and precise location', () => {
  const info = safeDeviceInfo({ onLine:true, language:'zh-CN', platform:'YodaOS', deviceId:'secret', serial:'secret' }, { width:480, height:352 });
  assert.equal(info.viewport, '480×352'); assert.ok(!JSON.stringify(info).includes('secret'));
  for (const key of ['deviceId','serial','latitude','longitude','rawValue']) assert.ok(isSensitiveText(key));
});

test('speech final result uses isFinal', () => {
  const event = { resultIndex:0, results:[{ 0:{ transcript:'测试' }, isFinal:true }] };
  assert.deepEqual(extractSpeechResult(event), { text:'测试', final:true });
});

test('withTimeout bounds pending probes', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5, 'probe'), /timed out/);
});

test('page remains confirm-only, deduplicates host events and auto-pages', async () => {
  const source = await readFile(new URL('../pages/index/index.ink', import.meta.url), 'utf8');
  assert.match(source, /c==='Enter'\|\|c==='GlobalHook'/); assert.match(source, /n-this\.lastConfirmAt<1500/); assert.match(source, /setInterval/);
  assert.doesNotMatch(source, /ArrowUp|ArrowDown|selectedIndex|selectChip|全部核心能力已通过/);
});

test('temporary onHide pauses paging but never cancels an active run', async () => {
  const source = await readFile(new URL('../pages/index/index.ink', import.meta.url), 'utf8');
  assert.match(source, /onHide\(\)\{this\.stopPaging\(\);\}/);
  assert.doesNotMatch(source, /onHide\(\)\{[^}]*cancelRun/);
  assert.match(source, /onUnload\(\)\{this\.stopPaging\(\);this\.cancelRun\(\);\}/);
});

test('async hardware probes are bounded', async () => {
  const source = await readFile(new URL('../pages/index/index.ink', import.meta.url), 'utf8');
  for (const timeout of ['16000','12000','5000','8000']) assert.ok(source.includes(timeout));
  assert.match(source, /onerror/); assert.match(source, /onend/);
});

test('privacy: page never renders transcript, coordinates, ids, barcode values or response bodies', async () => {
  const source = await readFile(new URL('../pages/index/index.ink', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\{\{.*transcript|deviceId|rawValue|coords\.latitude|coords\.longitude|response\.(text|json)\(/);
});
