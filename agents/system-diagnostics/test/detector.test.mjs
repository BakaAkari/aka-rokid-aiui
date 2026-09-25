import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  classifyCapability,
  CapabilityState,
  summarizeCapabilities,
  runtimeProbeList,
  RuntimeProbeNames,
  speechApiPresent,
  extractSpeechResult,
  describeSpeechStatus,
  SpeechState,
  nextSpeechState,
  cameraApiPresent,
  evaluateCamera,
  describeCameraError,
  describeTrackSettings,
  speakerApiPresent,
  tryProbeSpeaker,
  is2xx,
  baselineHealthy,
  NetworkState,
  formatLatency,
  clipDiagnostics,
  withTimeout,
  OverallVerdict,
  VerdictLabels,
  StepId,
  StepLabels,
  evaluateDeviceRun,
  isComplete
} from '../lib/detector.js';

test('page lifecycle does not cancel a run on temporary onHide', async () => {
  const source = await readFile(new URL('../pages/index/index.ink', import.meta.url), 'utf8');
  const onHide = source.match(/onHide\(\)\s*\{([\s\S]*?)\n\s*\},/);
  assert.ok(onHide, 'onHide handler must exist');
  assert.ok(!onHide[1].includes('cancelRun'), 'temporary permission UI must not invalidate the run');
  assert.match(source, /withTimeout\(this\.runSpeechRecognition\(\), 15000, 'speech'\)/);
  assert.match(source, /withTimeout\([\s\S]*getUserMedia\(\{ video: true \}\)[\s\S]*12000,[\s\S]*'camera'/);
});

test('one physical confirm cannot start and immediately stop the run', async () => {
  const source = await readFile(new URL('../pages/index/index.ink', import.meta.url), 'utf8');
  assert.match(source, /lastConfirmAt/);
  assert.match(source, /now - this\.lastConfirmAt < 1500/);
  assert.match(source, /duplicate confirm ignored/);
});

test('classifyCapability distinguishes unsupported, failed and ok', () => {
  assert.equal(classifyCapability(false, null), CapabilityState.UNSUPPORTED);
  assert.equal(classifyCapability(true, new Error('denied')), CapabilityState.FAILED);
  assert.equal(classifyCapability(true, null), CapabilityState.OK);
});

test('summarizeCapabilities produces honest counts', () => {
  assert.deepEqual(summarizeCapabilities({ a: 'ok', b: 'unsupported', c: 'failed' }), { pass: 1, unsupported: 1, failed: 1, total: 3, allOk: false });
  assert.equal(summarizeCapabilities({ a: 'ok' }).allOk, true);
  assert.equal(summarizeCapabilities({}).allOk, false);
});

test('runtimeProbeList exposes the documented base APIs', () => {
  const names = runtimeProbeList().map((p) => p.name);
  assert.ok(names.includes(RuntimeProbeNames.FETCH));
  assert.ok(names.includes(RuntimeProbeNames.ABORT_CONTROLLER));
  assert.ok(names.includes(RuntimeProbeNames.CRYPTO));
  assert.ok(names.includes(RuntimeProbeNames.READABLE_STREAM));
  assert.ok(names.includes(RuntimeProbeNames.TEXT_DECODER));
  assert.ok(names.includes(RuntimeProbeNames.MEDIA_DEVICES));
});

test('speech API presence needs SpeechRecognition', () => {
  assert.equal(speechApiPresent({ hasSpeechRecognition: true }), true);
  assert.equal(speechApiPresent({ hasSpeechRecognition: false }), false);
  assert.equal(speechApiPresent({}), false);
  assert.equal(speechApiPresent(null), false);
});

test('extractSpeechResult uses result.isFinal correctly', () => {
  const finalEvent = {
    resultIndex: 0,
    results: [{ 0: { transcript: '你好', confidence: 0.9 }, isFinal: true }]
  };
  assert.deepEqual(extractSpeechResult(finalEvent), { text: '你好', final: true });

  const interimEvent = {
    resultIndex: 1,
    results: [{}, { 0: { transcript: '你' }, isFinal: false }]
  };
  assert.deepEqual(extractSpeechResult(interimEvent), { text: '你', final: false });

  // A final result with empty transcript is NOT a success.
  const emptyFinal = {
    resultIndex: 0,
    results: [{ 0: { transcript: '' }, isFinal: true }]
  };
  const r = extractSpeechResult(emptyFinal);
  assert.equal(r.final, true);
  assert.equal(r.text, '');

  assert.deepEqual(extractSpeechResult(null), { text: '', final: false });
});

test('describeSpeechStatus never returns the transcript text', () => {
  assert.equal(describeSpeechStatus({ started: false, gotFinal: false }), '未识别');
  assert.equal(describeSpeechStatus({ started: true, gotFinal: true }), '已获取最终语音结果');
  assert.match(describeSpeechStatus({ started: true, gotFinal: false, error: 'not-allowed' }), /识别失败/);
  assert.ok(!describeSpeechStatus({ started: true, gotFinal: true }).includes('你好'));
});

test('speech state machine returns to idle on end', () => {
  assert.equal(nextSpeechState(SpeechState.STARTING, 'start'), SpeechState.LISTENING);
  assert.equal(nextSpeechState(SpeechState.LISTENING, 'stop'), SpeechState.STOPPING);
  assert.equal(nextSpeechState(SpeechState.STOPPING, 'end'), SpeechState.IDLE);
  assert.equal(nextSpeechState(SpeechState.LISTENING, 'error'), SpeechState.ERROR);
});

test('cameraApiPresent requires a documented camera surface', () => {
  assert.equal(cameraApiPresent({}), false);
  assert.equal(cameraApiPresent(null), false);
  assert.equal(cameraApiPresent({ hasW3cCamera: true }), true);
  assert.equal(cameraApiPresent({ hasImageCapture: true }), true);
  assert.equal(cameraApiPresent({ hasWxCamera: true }), true);
});

test('evaluateCamera is honest: ok only with a live video track', () => {
  const ok = evaluateCamera({ apiPresent: true, liveVideo: true });
  assert.equal(ok.state, CapabilityState.OK);
  assert.equal(ok.ok, true);

  const noApi = evaluateCamera({ apiPresent: false, liveVideo: false });
  assert.equal(noApi.state, CapabilityState.UNSUPPORTED);
  assert.equal(noApi.ok, false);

  const noLive = evaluateCamera({ apiPresent: true, liveVideo: false });
  assert.equal(noLive.state, CapabilityState.FAILED);
  assert.equal(noLive.ok, false);

  const denied = evaluateCamera({ apiPresent: true, liveVideo: false, error: 'NotAllowedError' });
  assert.equal(denied.detail, '相机权限被拒绝');
  assert.equal(denied.ok, false);
});

test('describeCameraError maps errors to safe text', () => {
  assert.equal(describeCameraError({ name: 'NotAllowedError' }), '相机权限被拒绝');
  assert.equal(describeCameraError({ name: 'NotFoundError' }), '未找到相机设备');
  assert.equal(describeCameraError({ name: 'Other' }), '相机检测发生错误');
  assert.equal(describeCameraError({}), '相机检测发生错误');
});

test('describeTrackSettings never echoes deviceId', () => {
  assert.equal(describeTrackSettings({ width: 1280, height: 720 }), '1280×720');
  assert.equal(describeTrackSettings({}), '尺寸未知');
  const withId = describeTrackSettings({ width: 640, height: 480, deviceId: 'secret-cam' });
  assert.ok(!withId.includes('secret-cam'));
});

test('speaker surface requires synthesis + utterance', () => {
  assert.equal(speakerApiPresent({ hasSpeechSynthesis: true, hasSpeechSynthesisUtterance: true }), true);
  assert.equal(speakerApiPresent({ hasSpeechSynthesis: true, hasSpeechSynthesisUtterance: false }), false);
  assert.equal(speakerApiPresent({}), false);
  // tryProbeSpeaker needs the runtime globals; without them it returns false.
  assert.equal(tryProbeSpeaker({ hasSpeechSynthesis: true, hasSpeechSynthesisUtterance: true }), false);
});

test('network baseline helpers are honest', () => {
  assert.ok(is2xx(200));
  assert.ok(is2xx(299));
  assert.equal(is2xx(404), false);
  assert.equal(is2xx(500), false);
  assert.equal(is2xx(null), false);
  assert.equal(is2xx('200'), false);

  assert.ok(baselineHealthy(NetworkState.OK, 204));
  assert.equal(baselineHealthy(NetworkState.OK, 500), false);
  assert.equal(baselineHealthy(NetworkState.FAIL, 200), false);
  assert.equal(baselineHealthy(NetworkState.OK, null), false);
});

test('formatLatency and clipDiagnostics bound output', () => {
  assert.equal(formatLatency(12), '12 ms');
  assert.equal(formatLatency(1500), '1.50 s');
  assert.equal(formatLatency(-1), 'N/A');
  assert.equal(clipDiagnostics('a'.repeat(200), 10).length, 11);
});

test('withTimeout rejects on timeout', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5, 'probe'), /timed out/);
  assert.equal(await withTimeout(Promise.resolve(7), 1000, 'probe'), 7);
});

test('evaluateDeviceRun gives honest overall verdicts', () => {
  const step = (state) => ({ state });
  const allOk = evaluateDeviceRun({ steps: [step('ok'), step('ok'), step('ok'), step('ok'), step('ok')] });
  assert.equal(allOk.verdict, OverallVerdict.COMPLETE);
  assert.equal(allOk.passed, true);
  assert.equal(isComplete(allOk.verdict), true);
  assert.equal(allOk.detail, '全部核心能力已通过');

  const partial = evaluateDeviceRun({ steps: [step('ok'), step('unsupported'), step('failed'), step('ok'), step('failed')] });
  assert.equal(partial.verdict, OverallVerdict.PARTIAL);
  assert.equal(partial.passed, false);
  assert.equal(partial.okCount, 2);

  const none = evaluateDeviceRun({ steps: [step('unsupported'), step('failed'), step('unsupported')] });
  assert.equal(none.verdict, OverallVerdict.FAILED);
  assert.equal(none.passed, false);

  const empty = evaluateDeviceRun({ steps: [] });
  assert.equal(empty.verdict, OverallVerdict.INCOMPLETE);
});

test('verdict labels never claim combat-power or hardware pass', () => {
  assert.equal(VerdictLabels[OverallVerdict.COMPLETE], '设备能力诊断完成');
  assert.equal(VerdictLabels[OverallVerdict.PARTIAL], '部分通过');
  assert.equal(VerdictLabels[OverallVerdict.FAILED], '诊断失败');
  assert.equal(VerdictLabels[OverallVerdict.INCOMPLETE], '诊断未完成');
  assert.equal(VerdictLabels[OverallVerdict.NOT_STARTED], '未开始');
  assert.equal(VerdictLabels[OverallVerdict.RUNNING], '诊断中…');

  assert.equal(StepLabels[StepId.RUNTIME], '运行时');
  assert.equal(StepLabels[StepId.SPEECH], '语音zh-CN');
  assert.equal(StepLabels[StepId.CAMERA], '相机');
  assert.equal(StepLabels[StepId.SPEAKER], '扬声器/合成');
  assert.equal(StepLabels[StepId.BASELINE], '公网HTTPS');
});