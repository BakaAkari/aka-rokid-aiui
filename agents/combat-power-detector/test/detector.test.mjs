import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraApiPresent,
  classifyVisualState,
  describeError,
  describeSnapshot,
  describeTrackSettings,
  DetectorState,
  evaluateCaptureOutcome,
  isCaptureOk,
  RunOutcome,
  CaptureMode,
  ModeLabels,
  StateLabels
} from '../lib/detector.js';

test('cameraApiPresent requires a documented camera surface', () => {
  assert.equal(cameraApiPresent({}), false);
  assert.equal(cameraApiPresent(null), false);
  assert.equal(cameraApiPresent({ hasW3cCamera: true }), true);
  assert.equal(cameraApiPresent({ hasImageCapture: true }), true);
  assert.equal(cameraApiPresent({ hasWxCamera: true }), true);
  assert.equal(cameraApiPresent({ hasW3cCamera: false, hasImageCapture: false, hasWxCamera: false }), false);
});

test('classifyVisualState distinguishes unsupported, error and snapshot', () => {
  assert.equal(classifyVisualState(false, null), DetectorState.UNSUPPORTED);
  assert.equal(classifyVisualState(true, new Error('denied')), DetectorState.ERROR);
  assert.equal(classifyVisualState(true, null), DetectorState.SNAPSHOT);
});

test('describeError maps error names to safe, non-sensitive text', () => {
  assert.equal(describeError({ name: 'NotAllowedError' }), '相机权限被拒绝');
  assert.equal(describeError({ name: 'NotFoundError' }), '未找到相机设备');
  assert.equal(describeError({ name: 'NotReadableError' }), '相机被占用或不可读');
  assert.equal(describeError({ name: 'SecurityError' }), '相机调用被安全策略阻止');
  assert.equal(describeError({ name: 'SomethingElse' }), '相机检测发生错误');
  assert.equal(describeError({}), '相机检测发生错误');
  // Never leaks the raw message.
  const leaked = describeError({ name: 'NotAllowedError', message: 'deviceId=abc123' });
  assert.ok(!leaked.includes('abc123'));
});

test('describeTrackSettings builds a compact size label and never echoes deviceId', () => {
  assert.equal(describeTrackSettings({ width: 1280, height: 720 }), '1280×720');
  assert.equal(describeTrackSettings({}), '尺寸未知');
  assert.equal(describeTrackSettings(null), '未知尺寸');
  const withId = describeTrackSettings({ width: 640, height: 480, deviceId: 'secret-cam' });
  assert.ok(!withId.includes('secret-cam'));
});

test('describeSnapshot returns mime and byte size without photo bytes', () => {
  assert.equal(describeSnapshot({ mimeType: 'image/jpeg', byteSize: 2048 }), 'image/jpeg · 2.0 KB');
  assert.equal(describeSnapshot({ mimeType: 'image/png', byteSize: null }), 'image/png');
  assert.equal(describeSnapshot(null), 'image');
});

test('evaluateCaptureOutcome is honest: PASS only with a live video track', () => {
  const ok = evaluateCaptureOutcome({ apiPresent: true, liveVideo: true });
  assert.equal(ok.outcome, RunOutcome.CAPTURE_OK);
  assert.equal(ok.ok, true);
  assert.equal(isCaptureOk(ok.outcome), true);
});

test('evaluateCaptureOutcome never passes without a camera API', () => {
  const r = evaluateCaptureOutcome({ apiPresent: false, liveVideo: false });
  assert.equal(r.outcome, RunOutcome.CAMERA_UNSUPPORTED);
  assert.equal(r.ok, false);
  assert.equal(isCaptureOk(r.outcome), false);
});

test('evaluateCaptureOutcome never passes without a live video track', () => {
  const denied = evaluateCaptureOutcome({ apiPresent: true, liveVideo: false, error: RunOutcome.PERMISSION_DENIED });
  assert.equal(denied.outcome, RunOutcome.PERMISSION_DENIED);
  assert.equal(denied.ok, false);

  const empty = evaluateCaptureOutcome({ apiPresent: true, liveVideo: false, error: RunOutcome.STREAM_EMPTY });
  assert.equal(empty.outcome, RunOutcome.STREAM_EMPTY);
  assert.equal(empty.ok, false);

  const unknown = evaluateCaptureOutcome({ apiPresent: true, liveVideo: false });
  assert.equal(unknown.outcome, RunOutcome.CAPTURE_FAILED);
  assert.equal(unknown.ok, false);

  // Even with an API and no error category, no live video => not pass.
  const bare = evaluateCaptureOutcome({ apiPresent: true, liveVideo: false, error: undefined });
  assert.equal(isCaptureOk(bare.outcome), false);
});

test('aborted is not a success', () => {
  const r = evaluateCaptureOutcome({ apiPresent: true, liveVideo: false, error: RunOutcome.ABORTED });
  assert.equal(r.outcome, RunOutcome.ABORTED);
  assert.equal(r.ok, false);
});

test('capture modes and labels are present and honest', () => {
  assert.equal(CaptureMode.DEFAULT, 'default');
  assert.equal(CaptureMode.WIDE, 'wide');
  assert.equal(CaptureMode.TELEPHOTO, 'telephoto');
  assert.equal(ModeLabels[CaptureMode.DEFAULT], '全景/默认');
  assert.equal(StateLabels[DetectorState.SNAPSHOT], '相机可用');
  assert.equal(StateLabels[DetectorState.UNSUPPORTED], '不支持');
});