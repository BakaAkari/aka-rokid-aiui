// Pure, runtime-independent logic for the 战斗力检测器 (combat-power-detector)
// PROTOTYPE. This module has NO dependency on AIUI runtime globals (no
// navigator.mediaDevices, no ImageCapture, no fetch). Everything here is a pure
// function so it can be unit-tested on the host with `node --test`. The .ink
// page imports these helpers and supplies the actual runtime objects.
//
// IMPORTANT: This is a PROTOTYPE that only proves CAMERA AVAILABILITY and a
// Visual State (permission granted / device present / snapshot size). It does
// NOT, and must not, claim to judge human combat power, identity, health, or
// safety. The on-screen UI and this module keep that honest: the verdict is
// always labelled 原型 / PROTOTYPE.
//
// Honest rule: we may only report "探测完成" when BOTH a real camera permission
// was granted AND a live video track was obtained. A mere capability check that
// finds `navigator.mediaDevices` present but that never opened a camera must not
// be reported as a successful capture.

// --- Capability / visual-state classification ------------------------------

export const DetectorState = Object.freeze({
  IDLE: 'idle',             // not started
  CHECKING: 'checking',     // probing permission / device availability
  CAPTURING: 'capturing',   // getUserMedia in flight, camera requested
  SNAPSHOT: 'snapshot',     // a live video track was obtained (success)
  ERROR: 'error',           // a hard failure (permission denied, no camera, etc.)
  UNSUPPORTED: 'unsupported' // the runtime exposes no camera API at all
});

export const StateLabels = Object.freeze({
  [DetectorState.IDLE]: '待检测',
  [DetectorState.CHECKING]: '检测中…',
  [DetectorState.CAPTURING]: '请求相机…',
  [DetectorState.SNAPSHOT]: '相机可用',
  [DetectorState.ERROR]: '失败',
  [DetectorState.UNSUPPORTED]: '不支持'
});

export const PermissionStudy = Object.freeze({
  GRANTED: 'granted',
  DENIED: 'denied',
  NOT_REQUESTED: 'not_requested',
  UNKNOWN: 'unknown'
});

/**
 * Whether the runtime surface for a camera exists at all.
 * `navigator.mediaDevices.getUserMedia` and the `ImageCapture` constructor are
 * the two Web-style entry points AIUI documents (media-capture). On runtimes
 * that only expose `wx.media.createCameraContext`, the page checks that too.
 *
 * @param {object} caps  { hasW3cCamera, hasImageCapture, hasWxCamera, hasWxTransform }
 * @returns {boolean}
 */
export function cameraApiPresent(caps) {
  if (!caps) return false;
  return Boolean(
    caps.hasW3cCamera || caps.hasImageCapture || caps.hasWxCamera
  );
}

/**
 * Decide how a camera/visual-state probe should be labelled.
 *
 * @param {boolean|undefined} present Whether the runtime symbol exists.
 * @param {unknown} probeError A thrown error / rejection, or null if none.
 * @returns {DetectorState}
 */
export function classifyVisualState(present, probeError) {
  if (probeError !== null && probeError !== undefined) {
    return DetectorState.ERROR;
  }
  if (present === true) {
    return DetectorState.SNAPSHOT;
  }
  return DetectorState.UNSUPPORTED;
}

/**
 * Map a JavaScript error onto a safe, non-sensitive message category. We never
 * surface raw messages that might contain device identifiers or stack tails.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function describeError(error) {
  const name = error && error.name ? String(error.name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return '相机权限被拒绝';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '未找到相机设备';
    case 'NotReadableError':
    case 'TrackStartError':
      return '相机被占用或不可读';
    case 'OverconstrainedError':
      return '相机约束无法满足';
    case 'SecurityError':
      return '相机调用被安全策略阻止';
    case 'InvalidStateError':
      return '相机状态已结束，请重试';
    case 'TypeError':
      return '相机 API 用法有误';
    default:
      return '相机检测发生错误';
  }
}

/**
 * Parse a MediaTrack's settings into a compact, displayable summary.
 * Pure: reads only numbers/strings, never echoes a deviceId.
 *
 * @param {{width?: unknown, height?: unknown, frameRate?: unknown}} settings
 * @returns {string}
 */
export function describeTrackSettings(settings) {
  if (!settings) return '未知尺寸';
  const w = typeof settings.width === 'number' ? settings.width : null;
  const h = typeof settings.height === 'number' ? settings.height : null;
  if (w == null && h == null) return '尺寸未知';
  if (w != null && h != null) return `${w}×${h}`;
  return `${w == null ? '?' : w}×${h == null ? '?' : h}`;
}

/**
 * Summarise a photo snapshot (Blob.size) into a human label. We only surface the
 * encoded byte count and mime type — we never write photo bytes anywhere.
 *
 * @param {object} args { mimeType?: string, byteSize?: number|null }
 * @returns {string}
 */
export function describeSnapshot(args) {
  const mime = args && typeof args.mimeType === 'string' ? args.mimeType : 'image';
  const size = args && typeof args.byteSize === 'number' ? args.byteSize : null;
  if (size == null) return mime;
  const kb = (size / 1024).toFixed(1);
  return `${mime} · ${kb} KB`;
}

// --- Capture mode mapping (documented AIUI photo settings) ------------------

export const CaptureMode = Object.freeze({
  DEFAULT: 'default',         // 3024×4032 portrait, full FOV — general photos
  WIDE: 'wide',               // 2016×2688 portrait, scanning
  TELEPHOTO: 'telephoto'      // 2016×1512 landscape, reading/analysis
});

export const ModeLabels = Object.freeze({
  [CaptureMode.DEFAULT]: '全景/默认',
  [CaptureMode.WIDE]: '扫码/广角',
  [CaptureMode.TELEPHOTO]: '阅读/长焦'
});

// --- Honest single-page run verdict ----------------------------------------
//
// The prototype UI is a single confirm-driven flow. A run is reported as
// successful ("相机可用 / 探测完成") ONLY when:
//   (a) a camera API surface exists, AND
//   (b) getUserMedia resolved to a stream with a live video track.
// Any missing permission, missing device, or a resolved-but-empty stream is NOT
// a success. The optional in-memory snapshot is presented as evidence of a live
// capture, but the prototype never interprets the image content.

export const RunPhase = Object.freeze({
  NOT_STARTED: 'not_started',
  RUNNING: 'running',
  DONE: 'done'
});

export const RunOutcome = Object.freeze({
  NOT_STARTED: 'not_started',
  CAPTURE_OK: 'capture_ok',
  CAMERA_UNSUPPORTED: 'camera_unsupported',
  PERMISSION_DENIED: 'permission_denied',
  DEVICE_MISSING: 'device_missing',
  STREAM_EMPTY: 'stream_empty',
  CAPTURE_FAILED: 'capture_failed',
  ABORTED: 'aborted'
});

export const OutcomeLabels = Object.freeze({
  [RunOutcome.NOT_STARTED]: '待检测',
  [RunOutcome.CAPTURE_OK]: '相机可用（原型）',
  [RunOutcome.CAMERA_UNSUPPORTED]: '此设备无相机 API（原型）',
  [RunOutcome.PERMISSION_DENIED]: '相机权限被拒（原型）',
  [RunOutcome.DEVICE_MISSING]: '未找到相机（原型）',
  [RunOutcome.STREAM_EMPTY]: '未取得画面（原型）',
  [RunOutcome.CAPTURE_FAILED]: '检测失败（原型）',
  [RunOutcome.ABORTED]: '已停止（原型）'
});

/**
 * The honest verdict. `liveVideo` is true ONLY when getUserMedia resolved to a
 * stream that yielded at least one video track with readyState 'live'. This is
 * the single fact that proves camera availability; nothing else counts.
 *
 * @param {object} input
 * @param {boolean} input.apiPresent  Whether a camera API surface exists.
 * @param {boolean} input.liveVideo   Whether a live video track was obtained.
 * @param {string}  input.error       One of DetectorState / error category.
 * @returns {{outcome: string, ok: boolean, detail: string}}
 */
export function evaluateCaptureOutcome(input) {
  const apiPresent = input.apiPresent === true;
  const liveVideo = input.liveVideo === true;

  if (input.error === RunOutcome.ABORTED) {
    return { outcome: RunOutcome.ABORTED, ok: false, detail: '检测已停止' };
  }
  if (!apiPresent) {
    return {
      outcome: RunOutcome.CAMERA_UNSUPPORTED,
      ok: false,
      detail: '未检测到相机 API，原型无法打开相机'
    };
  }
  if (!liveVideo) {
    // Even though a camera API may exist, no live video track was obtained, so
    // we must NOT claim camera availability. Callers pass a specific error.
    switch (input.error) {
      case RunOutcome.PERMISSION_DENIED:
        return { outcome: RunOutcome.PERMISSION_DENIED, ok: false, detail: '相机权限未授予' };
      case RunOutcome.DEVICE_MISSING:
        return { outcome: RunOutcome.DEVICE_MISSING, ok: false, detail: '未找到相机设备' };
      case RunOutcome.STREAM_EMPTY:
        return { outcome: RunOutcome.STREAM_EMPTY, ok: false, detail: '未取得实时画面' };
      default:
        return { outcome: RunOutcome.CAPTURE_FAILED, ok: false, detail: '相机检测失败' };
    }
  }
  // Only a live video track proves the camera is usable.
  return { outcome: RunOutcome.CAPTURE_OK, ok: true, detail: '相机可用（原型）' };
}

/**
 * Isolate the one honest "PASS" label. The prototype UI must render exactly
 * this only when a live video track was obtained. This keeps the prototype from
 * ever presenting an unproven success.
 *
 * @param {string} outcome  One of RunOutcome values.
 * @returns {boolean}
 */
export function isCaptureOk(outcome) {
  return outcome === RunOutcome.CAPTURE_OK;
}