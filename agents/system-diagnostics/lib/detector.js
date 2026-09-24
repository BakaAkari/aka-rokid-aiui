// Pure, runtime-independent logic for the 系统测试（设备系统测试）agent.
// SYSTEM TEST / DEVICE DIAGNOSTIC. This module has NO dependency on AIUI runtime
// globals (no fetch, no navigator.mediaDevices, no SpeechRecognition, no
// speechSynthesis). Everything here is a pure function so it can be unit-tested
// on the host with `node --test`. The .ink page imports these helpers and
// supplies the actual runtime objects.
//
// IMPORTANT: This is a DEVICE-CAPABILITY SYSTEM TEST, not a product/prototype and
// definitely not a combat-power judge. It tests a running device's important
// runtime and hardware surfaces (AIUI base APIs, speech recognition / zh-CN,
// camera, speaker / speech synthesis, public HTTPS baseline) and reports each one
// honestly as ok / unsupported / failed. It does NOT, and must not, claim to
// judge human combat power, identity, health, or safety. The on-screen UI and
// this module keep that honest: the overall verdict is always one of
// 设备能力诊断完成 / 部分通过 / 失败 / 未完成, never a fake combat-power score.

// --- Capability / feature classification -------------------------------------

// A capability is "unsupported" when the runtime symbol is simply absent.
// It is a "failed" state when the symbol exists but invoking it throws or
// rejects. It is "ok" only when the symbol exists AND a non-throwing invocation
// succeeds.
export const CapabilityState = Object.freeze({
  OK: 'ok',
  UNSUPPORTED: 'unsupported',
  FAILED: 'failed',
  UNKNOWN: 'unknown'
});

/**
 * Decide how a runtime feature should be labelled.
 *
 * @param {boolean|undefined} present Whether the runtime symbol exists.
 * @param {unknown} probeError A thrown error / rejection, or null if none.
 * @returns {CapabilityState}
 */
export function classifyCapability(present, probeError) {
  if (probeError !== null && probeError !== undefined) {
    return CapabilityState.FAILED;
  }
  if (present === true) {
    return CapabilityState.OK;
  }
  return CapabilityState.UNSUPPORTED;
}

/**
 * Summarise a feature map into pass/unsupported/failed counts.
 *
 * @param {Record<string, string>} features  feature name -> CapabilityState.
 * @returns {{pass: number, unsupported: number, failed: number, total: number, allOk: boolean}}
 */
export function summarizeCapabilities(features) {
  const values = Object.values(features || {});
  const pass = values.filter((s) => s === CapabilityState.OK).length;
  const unsupported = values.filter((s) => s === CapabilityState.UNSUPPORTED).length;
  const failed = values.filter((s) => s === CapabilityState.FAILED).length;
  return {
    pass,
    unsupported,
    failed,
    total: values.length,
    allOk: failed === 0 && unsupported === 0 && values.length > 0
  };
}

// --- Runtime / AIUI base API surface (probe list) ----------------------------
//
// A capability row is "unsupported" when the symbol is absent, "failed" when the
// symbol exists but a safe invocation throws, and "ok" when it exists and the
// invocation does not throw. None of these probes reads a network response body
// or touches a deviceId / photo bytes / transcript.

export const RuntimeProbeNames = Object.freeze({
  FETCH: 'fetch',
  ABORT_CONTROLLER: 'AbortController',
  CRYPTO: 'crypto.randomUUID',
  READABLE_STREAM: 'ReadableStream',
  TEXT_DECODER: 'TextDecoder',
  MEDIA_DEVICES: 'navigator.mediaDevices'
});

/**
 * The ordered list of base runtime probes. Each entry carries a name plus an
 * optional `probe` that throws when the symbol is present but unusable. The
 * `.ink` page invokes `probeRuntime()` and turns each into a CapabilityState.
 *
 * @returns {Array<{name: string, present: () => boolean, probe?: () => void}>}
 */
export function runtimeProbeList() {
  return [
    {
      name: RuntimeProbeNames.FETCH,
      present: () => typeof fetch === 'function'
    },
    {
      name: RuntimeProbeNames.ABORT_CONTROLLER,
      present: () => typeof AbortController !== 'undefined',
      probe: () => {
        if (typeof AbortController !== 'function') throw new Error('no AbortController');
      }
    },
    {
      name: RuntimeProbeNames.CRYPTO,
      present: () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    },
    {
      name: RuntimeProbeNames.READABLE_STREAM,
      present: () => typeof ReadableStream !== 'undefined'
    },
    {
      name: RuntimeProbeNames.TEXT_DECODER,
      present: () => typeof TextDecoder !== 'undefined',
      probe: () => {
        const d = new TextDecoder('utf-8');
        if (d.decode(new Uint8Array([0x41])) !== 'A') throw new Error('decode failed');
      }
    },
    {
      name: RuntimeProbeNames.MEDIA_DEVICES,
      present: () => !!(typeof navigator !== 'undefined' && navigator.mediaDevices)
    }
  ];
}

// --- Speech recognition (zh-CN) state machine --------------------------------

export const SpeechState = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  LISTENING: 'listening',
  STOPPING: 'stopping',
  ERROR: 'error',
  DONE: 'done'
});

/**
 * Map a stream of SpeechRecognition lifecycle events onto the next visible
 * state. `end` is the terminal signal; a final result (if one arrived) keeps
 * the state DONE until `end` resets to IDLE.
 *
 * @param {SpeechState} current Current state.
 * @param {string} event One of: 'start', 'result', 'error', 'abort', 'end'.
 * @returns {SpeechState}
 */
export function nextSpeechState(current, event) {
  switch (event) {
    case 'start':
      return SpeechState.LISTENING;
    case 'result':
      return SpeechState.LISTENING;
    case 'stop':
      return SpeechState.STOPPING;
    case 'abort':
      return SpeechState.STOPPING;
    case 'error':
      return SpeechState.ERROR;
    case 'end':
      return SpeechState.IDLE;
    default:
      return current;
  }
}

/**
 * Whether the runtime exposes a polyfill / native `SpeechRecognition` usable
 * for a live mic session (the documented AIUI mic-recognition entry point).
 *
 * @param {object} caps { hasSpeechRecognition }
 * @returns {boolean}
 */
export function speechApiPresent(caps) {
  return !!(caps && caps.hasSpeechRecognition);
}

/**
 * Extract the transcript from a standard speech `result` event, proving the
 * page reads `result.isFinal` correctly. Returns the committed text plus a
 * `final` flag. The page must NOT persist or stack the full transcript on
 * screen; it only surfaces a short status.
 *
 * @param {object} event The recognition `result` event.
 * @returns {{text: string, final: boolean}}
 */
export function extractSpeechResult(event) {
  const resultIndex =
    event && typeof event.resultIndex === 'number' ? event.resultIndex : 0;
  const results = event && event.results;
  const result = results && results[resultIndex];
  const alt = result && result[0];
  const text = alt && typeof alt.transcript === 'string' ? alt.transcript : '';
  const isFinal = result ? result.isFinal === true : false;
  return { text, final: isFinal };
}

/**
 * Build a short, non-persistent status label from a speech run. The transcript
 * itself is deliberately NOT returned so the UI never stacks or persists the
 * full recognised text — it only reports whether a final result was obtained.
 *
 * @param {{started: boolean, gotFinal: boolean, error?: string}} r
 * @returns {string}
 */
export function describeSpeechStatus(r) {
  if (r.error) return `识别失败（${r.error}）`;
  if (r.gotFinal) return '已获取最终语音结果';
  if (r.started) return '识别中';
  return '未识别';
}

// --- Camera / visual state ---------------------------------------------------

/**
 * Whether the runtime surface for a camera exists at all. AIUI documents the
 * W3C `getUserMedia` and `ImageCapture` entry points, with `wx.media` contexts
 * as a fallback surface.
 *
 * @param {object} caps { hasW3cCamera, hasImageCapture, hasWxCamera }
 * @returns {boolean}
 */
export function cameraApiPresent(caps) {
  if (!caps) return false;
  return Boolean(caps.hasW3cCamera || caps.hasImageCapture || caps.hasWxCamera);
}

/**
 * Map a JavaScript error onto a safe, non-sensitive message category.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function describeCameraError(error) {
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
    default:
      return '相机检测发生错误';
  }
}

/**
 * Parse a MediaTrack's settings into a compact, displayable summary. Pure:
 * reads only numbers/strings, never echoes a deviceId.
 *
 * @param {{width?: unknown, height?: unknown}} settings
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
 * Honest camera verdict: a camera is usable ONLY when a full W3C path yielded a
 * live video track. A mere API presence or a resolved-but-empty stream is not a
 * success.
 *
 * @param {object} input
 * @param {boolean} input.apiPresent
 * @param {boolean} input.liveVideo
 * @param {string} [input.error] One of CameraError values.
 * @returns {{state: string, ok: boolean, detail: string}}
 */
export function evaluateCamera(input) {
  const apiPresent = input.apiPresent === true;
  const liveVideo = input.liveVideo === true;
  if (!apiPresent) {
    return {
      state: CapabilityState.UNSUPPORTED,
      ok: false,
      detail: '未检测到相机 API'
    };
  }
  if (!liveVideo) {
    return {
      state: CapabilityState.FAILED,
      ok: false,
      detail: input.error && input.error !== CapabilityState.UNKNOWN
        ? describeCameraError({ name: input.error })
        : '未取得实时画面'
    };
  }
  return { state: CapabilityState.OK, ok: true, detail: '相机可用（原型）' };
}

// --- Speaker / speech synthesis ---------------------------------------------

/**
 * Whether the runtime exposes a usable speech-synthesis surface. The docs
 * describe `speechSynthesis` + `SpeechSynthesisUtterance`; we only DETECT the
 * surface (construct an utterance) and never trigger playback automatically.
 *
 * @param {object} caps { hasSpeechSynthesis, hasSpeechSynthesisUtterance }
 * @returns {boolean}
 */
export function speakerApiPresent(caps) {
  return Boolean(
    caps && caps.hasSpeechSynthesis && caps.hasSpeechSynthesisUtterance
  );
}

/**
 * Safe speaker probe (does not play audio). Returns true when the surface
 * exists AND constructing an utterance works; otherwise false.
 *
 * @param {object} caps { hasSpeechSynthesis, hasSpeechSynthesisUtterance }
 * @returns {boolean}
 */
export function tryProbeSpeaker(caps) {
  if (!speakerApiPresent(caps)) return false;
  try {
    const u = new SpeechSynthesisUtterance('探测');
    return Boolean(u);
  } catch (error) {
    return false;
  }
}

// --- Network / public HTTPS baseline ----------------------------------------

export const NetworkState = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  OK: 'ok',
  FAIL: 'fail'
});

/**
 * @param {number|null} code
 * @returns {boolean}
 */
export function is2xx(code) {
  return typeof code === 'number' && code >= 200 && code < 300;
}

/**
 * A baseline is healthy only when it completed and returned a 2xx HTTP status.
 *
 * @param {string} status One of NetworkState values.
 * @param {number|null} httpStatus
 * @returns {boolean}
 */
export function baselineHealthy(status, httpStatus) {
  return status === NetworkState.OK && is2xx(httpStatus);
}

/**
 * Format an elapsed millisecond value for display.
 *
 * @param {number|null} ms
 * @returns {string}
 */
export function formatLatency(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return 'N/A';
  const r = Math.round(ms);
  return r < 1000 ? `${r} ms` : `${(r / 1000).toFixed(2)} s`;
}

/**
 * Clip a diagnostics string to a bounded number of characters.
 *
 * @param {string} value
 * @param {number} [limit]
 * @returns {string}
 */
export function clipDiagnostics(value, limit = 60) {
  const text = typeof value === 'string' ? value : String(value == null ? '' : value);
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, limit)}…`;
}

/**
 * Resolve with the wrapped promise's value, or reject with a timeout error if it
 * has not settled within `ms`. Pure and testable.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [label]
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms, label = 'operation') {
  const timeoutMs = typeof ms === 'number' && ms > 0 ? ms : 0;
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// --- Overall device-capability run verdict ----------------------------------
//
// The run is a single confirm-driven sequence over five core steps
// (runtime, speech zh-CN, camera, speaker, public HTTPS baseline). The overall
// verdict may NEVER be "all hardware passed" or a combat-power score. It is one
// of:
//   设备能力诊断完成  -> every step ended ok
//   部分通过          -> at least one ok but not every step ok
//   失败              -> no step ok (all unsupported / failed)
//   未完成            -> aborted / not finished
//
// Compatibility: the previous 0.1.0 RunOutcome / CaptureMode enums are replaced
// by the single honest vocabulary below. The labels define the only verdict
// terms the whole app may use.

export const RunPhase = Object.freeze({
  NOT_STARTED: 'not_started',
  RUNNING: 'running',
  DONE: 'done'
});

export const OverallVerdict = Object.freeze({
  NOT_STARTED: 'not_started',
  RUNNING: 'running',
  COMPLETE: 'complete',   // 设备能力诊断完成
  PARTIAL: 'partial',     // 部分通过
  FAILED: 'failed',       // 失败
  INCOMPLETE: 'incomplete' // 未完成
});

export const VerdictLabels = Object.freeze({
  [OverallVerdict.NOT_STARTED]: '未开始',
  [OverallVerdict.RUNNING]: '诊断中…',
  [OverallVerdict.COMPLETE]: '设备能力诊断完成',
  [OverallVerdict.PARTIAL]: '部分通过',
  [OverallVerdict.FAILED]: '诊断失败',
  [OverallVerdict.INCOMPLETE]: '诊断未完成'
});

// The five core steps in their fixed order.
export const StepId = Object.freeze({
  RUNTIME: 'runtime',
  SPEECH: 'speech',
  CAMERA: 'camera',
  SPEAKER: 'speaker',
  BASELINE: 'baseline'
});

export const StepLabels = Object.freeze({
  [StepId.RUNTIME]: '运行时',
  [StepId.SPEECH]: '语音zh-CN',
  [StepId.CAMERA]: '相机',
  [StepId.SPEAKER]: '扬声器/合成',
  [StepId.BASELINE]: '公网HTTPS'
});

/**
 * The honest overall verdict for a completed run.
 *
 * @param {object} input
 * @param {Array<{id: string, state: string}>} input.steps Core steps with a
 *   CapabilityState ('ok' | 'unsupported' | 'failed'). Only these 5 decide the
 *   verdict; the optional snapshot evidence is not a verdict input.
 * @returns {{verdict: string, passed: boolean, okCount: number, total: number, detail: string}}
 */
export function evaluateDeviceRun(input) {
  const steps = Array.isArray(input && input.steps) ? input.steps : [];
  const total = steps.length;
  if (total === 0) {
    return { verdict: OverallVerdict.INCOMPLETE, passed: false, okCount: 0, total: 0, detail: '未检测到任何能力，诊断未完成' };
  }
  const okCount = steps.filter((s) => s && s.state === CapabilityState.OK).length;
  if (okCount === total) {
    return { verdict: OverallVerdict.COMPLETE, passed: true, okCount, total, detail: '全部核心能力已通过' };
  }
  if (okCount > 0) {
    return { verdict: OverallVerdict.PARTIAL, passed: false, okCount, total, detail: `${okCount}/${total} 项通过，其余不支持或失败` };
  }
  return { verdict: OverallVerdict.FAILED, passed: false, okCount: 0, total, detail: '无一项核心能力可用' };
}

/**
 * @param {string} verdict One of OverallVerdict values.
 * @returns {boolean} True only for COMPLETE.
 */
export function isComplete(verdict) {
  return verdict === OverallVerdict.COMPLETE;
}