// Pure, runtime-independent logic for the 连线诊断 capability probe.
// This module has NO dependency on AIUI runtime globals (no fetch, no navigator,
// no SpeechRecognition). Everything here is a pure function so it can be
// unit-tested with `node --test` on the host. The .ink page imports these
// helpers and supplies the actual runtime objects.

// --- Capability / feature detection -----------------------------------------

// A capability is "unsupported" when the runtime symbol is simply absent.
// It is a "failure" when the symbol exists but invoking it throws or rejects.
export const CapabilityState = Object.freeze({
  UNSUPPORTED: 'unsupported',
  FAILED: 'failed',
  OK: 'ok',
  UNKNOWN: 'unknown'
});

/**
 * Decide how a runtime feature should be labelled.
 *
 * @param {boolean|undefined} present Whether the runtime symbol exists.
 * @param {unknown} probeError  A thrown error / rejection, or null if none.
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
 * Textual summary for one capability row.
 *
 * @param {{name: string, state: string, detail?: string}} item
 * @returns {string}
 */
export function describeCapability(item) {
  const base = `${item.name} · ${item.state}`;
  return item.detail ? `${base} · ${item.detail}` : base;
}

// --- Speech recognition state machine ---------------------------------------

export const RecogState = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  LISTENING: 'listening',
  STOPPING: 'stopping',
  ERROR: 'error'
});

/**
 * Map a stream of recognition events onto the next visible state.
 *
 * @param {RecogState} current  Current state.
 * @param {string} event  One of: 'start', 'audiostart', 'speechstart',
 *   'result', 'error', 'stop', 'abort', 'end'.
 * @returns {RecogState} The next state.
 */
export function nextRecogState(current, event) {
  switch (event) {
    case 'start':
      return RecogState.LISTENING;
    case 'audiostart':
    case 'speechstart':
      return current === RecogState.STARTING ? RecogState.LISTENING : current;
    case 'result':
      // A result means the recogniser is actively returning live audio.
      return RecogState.LISTENING;
    case 'stop':
    case 'abort':
      return RecogState.STOPPING;
    case 'error':
      return RecogState.ERROR;
    case 'end':
      return RecogState.IDLE;
    default:
      return current;
  }
}

export const TranscriptType = Object.freeze({
  INTERIM: 'interim',
  FINAL: 'final'
});

/**
 * Extract the transcript + type from a standard speech `result` event.
 *
 * @param {object} event  The recognition `result` event.
 * @returns {{text: string, type: string, confidence: number|null}}
 */
export function extractTranscript(event) {
  const alt =
    event &&
    event.results &&
    event.results[event.resultIndex] &&
    event.results[event.resultIndex][0];
  if (!alt) {
    return { text: '', type: TranscriptType.INTERIM, confidence: null };
  }
  const result = event.results[event.resultIndex];
  const isFinal = Boolean(result.isFinal);
  return {
    text: typeof alt.transcript === 'string' ? alt.transcript : '',
    type: isFinal ? TranscriptType.FINAL : TranscriptType.INTERIM,
    confidence: typeof alt.confidence === 'number' ? alt.confidence : null
  };
}

/**
 * Concatenate an interim update onto the current provisional line, or commit
 * a final line into the committed history.
 *
 * @param {object} state  { interim: string, committed: string[] }
 * @param {{text: string, type: string}} update
 * @returns {{interim: string, committed: string[]}}
 */
export function applyTranscript(state, update) {
  const committed = Array.isArray(state.committed) ? state.committed.slice() : [];
  const text = update && typeof update.text === 'string' ? update.text : '';
  if (update && update.type === TranscriptType.FINAL) {
    const line = text.trim();
    if (line) {
      committed.push(line);
    }
    return { interim: '', committed };
  }
  return { interim: text, committed };
}

// --- Network probe formatting -----------------------------------------------

/**
 * Format an elapsed millisecond value for display.
 *
 * @param {number|null} ms
 * @returns {string}
 */
export function formatLatency(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return 'N/A';
  }
  const rounded = Math.round(ms);
  return rounded < 1000 ? `${rounded} ms` : `${(rounded / 1000).toFixed(2)} s`;
}

/**
 * Clip a diagnostics string to a bounded number of characters so the on-screen
 * log never overruns the 480px canvas.
 *
 * @param {string} value
 * @param {number} [limit]
 * @returns {string}
 */
export function clipDiagnostics(value, limit = 180) {
  const text = typeof value === 'string' ? value : String(value == null ? '' : value);
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, limit)}…`;
}

export const NetworkStatus = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  OK: 'ok',
  ERROR: 'error',
  TIMEOUT: 'timeout'
});

/**
 * Build the human-readable probe outcome from the raw pieces. Pure, so the
 * "final" render path stays consistent and testable regardless of fetch.
 *
 * @param {object} args
 * @param {string} args.status  One of NetworkStatus values.
 * @param {number|null} args.elapsedMs
 * @param {number|null} args.httpStatus
 * @param {boolean|null} args.ok
 * @param {string} [args.endpoint]
 * @param {string} [args.summary]
 * @param {string} [args.diagnostic]
 * @returns {{statusText: string, latencyText: string, okText: string, summary: string, diagnostic: string}}
 */
export function buildProbeOutcome(args) {
  const status = args.status || NetworkStatus.IDLE;
  const latencyText = formatLatency(args.elapsedMs);
  let okText = 'N/A';
  let statusText = 'IDLE';
  let summary = args.summary || '';
  switch (status) {
    case NetworkStatus.LOADING:
      statusText = 'LOADING';
      summary = summary || '正在建立连接…';
      break;
    case NetworkStatus.OK:
      statusText = 'OK';
      okText = args.ok === true ? '是' : args.ok === false ? '否' : 'N/A';
      summary = summary || `HTTP ${args.httpStatus == null ? 'N/A' : args.httpStatus}`;
      break;
    case NetworkStatus.ERROR:
      statusText = 'ERROR';
      summary = summary || args.diagnostic || '连接出错';
      break;
    case NetworkStatus.TIMEOUT:
      statusText = 'TIMEOUT';
      summary = summary || '请求超时，未返回结果';
      break;
    default:
      break;
  }
  return {
    statusText,
    latencyText,
    okText,
    summary,
    diagnostic: clipDiagnostics(args.diagnostic || '')
  };
}

// --- Timeout helper ---------------------------------------------------------

/**
 * Resolve with the wrapped promise's value, or reject with a timeout error if
 * the promise has not settled within `ms`. The wrapped promise itself is not
 * cancelled; this only bounds how long the caller waits. Pure and testable.
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
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Probe result classification across feature classes.
 *
 * @param {object} features  A map of feature name -> CapabilityState.
 * @returns {{pass: number, unsupported: number, failed: number, total: number, allOk: boolean}}
 */
export function summarizeCapabilities(features) {
  const values = Object.values(features || {});
  const pass = values.filter((s) => s === CapabilityState.OK).length;
  const unsupported = values.filter((s) => s === CapabilityState.UNSUPPORTED).length;
  const failed = values.filter((s) => s === CapabilityState.FAILED).length;
  return { pass, unsupported, failed, total: values.length, allOk: failed === 0 && unsupported === 0 && values.length > 0 };
}

// --- Network path diagnostic matrix ----------------------------------------
//
// The 真机 diagnostic distinguishes three kinds of HTTPS endpoints supplied at
// startup (see README / DEVICE_TEST):
//   baseline  -> 公网基线 (public internet, e.g. js.rokid.com)
//   magicdns  -> Tailscale MagicDNS hostname, only resolvable/reachable when
//                the phone's Tailscale tunnel carries the glasses' traffic.
//   ip        -> optional Tailscale 100.x.x.x HTTPS, reachable only when the
//                private tailnet route is active.
// No private IP, magic DNS hostname, auth credential or app key is hardcoded
// here: those arrive as user-provided startup args and are only accepted via
// https://.

export const ProbeCategory = Object.freeze({
  BASELINE: 'baseline',
  MAGICDNS: 'magicdns',
  IP: 'ip'
});

export const CategoryLabels = Object.freeze({
  [ProbeCategory.BASELINE]: '公网基线',
  [ProbeCategory.MAGICDNS]: 'Tailscale MagicDNS',
  [ProbeCategory.IP]: 'Tailscale IP'
});

export const ProbeItemStatus = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  OK: 'ok',
  ERROR: 'error',
  TIMEOUT: 'timeout'
});

/**
 * True only for an https:// URL. Anything else is rejected so that neither an
 * http:// endpoint nor a localhost/private literal can sneak into the probe.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHttpsUrl(value) {
  return typeof value === 'string' && /^https:\/\//i.test(value.trim());
}

/**
 * Build the ordered probe plan from user-supplied startup args. Order is fixed:
 * public baseline, then MagicDNS, then optional Tailscale IP. Non-https or
 * absent values are silently skipped. The baseline falls back to the Default
 * public endpoint when omitted (only when the diagnostic mode is engaged).
 *
 * @param {{baseline?: unknown, magicdns?: unknown, ip?: unknown}} config
 * @returns {Array<{category: string, label: string, url: string}>}
 */
export function buildProbePlan(config) {
  const plan = [];
  const add = (category, value) => {
    if (isHttpsUrl(value)) {
      plan.push({ category, label: CategoryLabels[category], url: value.trim() });
    }
  };
  add(ProbeCategory.BASELINE, config && config.baseline);
  add(ProbeCategory.MAGICDNS, config && config.magicdns);
  add(ProbeCategory.IP, config && config.ip);
  return plan;
}

/**
 * A probe is "healthy" only when it completed without error AND returned a
 * 2xx HTTP status. Anything else (timeout, connection error, non-2xx) is NOT
 * treated as a success, so the run can never falsely report reachability.
 *
 * @param {string} status  One of ProbeItemStatus values.
 * @param {number|null} httpStatus
 * @returns {boolean}
 */
export function isHealthy(status, httpStatus) {
  return (
    status === ProbeItemStatus.OK &&
    typeof httpStatus === 'number' &&
    httpStatus >= 200 &&
    httpStatus < 300
  );
}

/**
 * Short human label for one probe item (status / http / latency aware).
 *
 * @param {{status?: string, httpStatus?: number|null}} item
 * @returns {string}
 */
export function describeProbeItem(item) {
  if (!item) return 'N/A';
  switch (item.status) {
    case ProbeItemStatus.LOADING:
      return '探测中…';
    case ProbeItemStatus.OK:
      return `HTTP ${item.httpStatus == null ? 'N/A' : item.httpStatus}`;
    case ProbeItemStatus.TIMEOUT:
      return '超时';
    case ProbeItemStatus.ERROR:
      return item.httpStatus != null ? `HTTP ${item.httpStatus}` : '失败';
    default:
      return '未执行';
  }
}

/**
 * Give an overall PASS / FAIL / INCONCLUSIVE verdict for a completed run.
 *
 * PASS only when every planned endpoint was reached with a 2xx health check.
 * FAIL when any endpoint was not healthy (which is the honest signal that the
 * requested path — e.g. Tailscale MagicDNS — was NOT proven). This never marks
 * a run as successful when an endpoint errored or timed out.
 *
 * @param {Array<{id?: string, label?: string, category?: string, status?: string, httpStatus?: number|null}>} items
 * @returns {{verdict: string, pass: boolean, reachableCount: number, total: number, summary: string}}
 */
export function evaluateProbeRun(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return {
      verdict: 'SKIP',
      pass: false,
      reachableCount: 0,
      total: 0,
      summary: '未配置任何 https:// 端点，无法判定'
    };
  }
  const incomplete = list.filter((it) => !it || it.status === ProbeItemStatus.LOADING);
  if (incomplete.length > 0) {
    return {
      verdict: 'INCONCLUSIVE',
      pass: false,
      reachableCount: 0,
      total: list.length,
      summary: '存在未完成的探测，无法给出终判'
    };
  }
  const total = list.length;
  const failed = list.filter((it) => !isHealthy(it.status, it.httpStatus));
  const reachableCount = total - failed.length;
  const pass = reachableCount === total;
  let summary;
  if (pass) {
    summary = `全部 ${total} 项均健康（HTTP 2xx）`;
  } else {
    const names = failed.map((it) => (it && it.label) || it.category || '未知').join('、');
    const reasons = failed
      .map((it) => {
        if (!it) return '未知';
        if (it.status === ProbeItemStatus.TIMEOUT) return '超时';
        if (it.status === ProbeItemStatus.ERROR) {
          return it.httpStatus != null ? `HTTP ${it.httpStatus}` : '连接失败';
        }
        return it.status || '未健康';
      })
      .join('、');
    summary = `${failed.length}/${total} 项未达健康：${names}（${reasons}）。不能据此证明流量经手机 Tailscale。`;
  }
  return { verdict: pass ? 'PASS' : 'FAIL', pass, reachableCount, total, summary };
}

export const DefaultEndpoint =
  'https://js.rokid.com/';

// --- Honest single-page diagnostic (run-level) -----------------------------
//
// The UI is now a single confirm-driven "连线诊断" flow, NOT a tabbed menu.
// Voice wakeup launches the app; the only physical interaction is the confirm
// key. A full run executes in order:
//   ① runtime self-check (显示为「运行环境」，不是所谓「网络通过」)
//   ② public HTTPS baseline
//   ③ Tailscale MagicDNS HTTPS (only if injected)
// Plus an OPTIONAL Tailscale IP probe which is secondary only and never enters
// the main PASS verdict (a public cert usually doesn't cover an IP literal, so
// a TLS failure there is not proof the tailnet route is down).

export const PhaseId = Object.freeze({
  RUNTIME: 'runtime',
  BASELINE: 'baseline',
  MAGICDNS: 'magicdns'
});

export const PhaseLabels = Object.freeze({
  [PhaseId.RUNTIME]: '运行环境',
  [PhaseId.BASELINE]: '公网',
  [PhaseId.MAGICDNS]: '手机Tailscale'
});

export const PhaseStatus = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  OK: 'ok',
  FAIL: 'fail',
  SKIP: 'skip'
});

export const RunVerdict = Object.freeze({
  NOT_STARTED: 'not_started',
  RUNNING: 'running',
  PASS: 'pass',
  FAIL: 'fail',
  INCOMPLETE: 'incomplete'
});

export const VerdictLabels = Object.freeze({
  [RunVerdict.NOT_STARTED]: '未开始',
  [RunVerdict.RUNNING]: '运行中',
  [RunVerdict.PASS]: '链路通过',
  [RunVerdict.FAIL]: '诊断失败',
  [RunVerdict.INCOMPLETE]: '诊断未完成'
});

/**
 * @param {number|null} code
 * @returns {boolean}
 */
export function is2xx(code) {
  return typeof code === 'number' && code >= 200 && code < 300;
}

/**
 * Derive the boolean runtime-ok flag from a capability summary. Runtime is ok
 * only when every capability is OK (no unsupported, no failed, non-empty).
 *
 * @param {{allOk?: boolean}|null} summary
 * @returns {boolean}
 */
export function runtimeOkFromSummary(summary) {
  return !!(summary && summary.allOk);
}

/**
 * The honest run verdict. Designed so a run can NEVER report PASS unless:
 *   - a MagicDNS endpoint was configured, AND
 *   - the runtime self-check passed, AND
 *   - the public baseline was healthy (2xx), AND
 *   - the MagicDNS endpoint was healthy (2xx).
 *
 * If no MagicDNS endpoint was injected the verdict is INCOMPLETE, regardless of
 * how well the runtime or public baseline performed — the single-pass outcome
 * may not be reported as a false success. The optional Tailscale IP probe is
 * intentionally NOT part of this decision (TLS IP-cert issues).
 *
 * @param {object} input
 * @param {boolean} input.runtimeOk
 * @param {string} input.baselineStatus  One of PhaseStatus values.
 * @param {number|null} input.baselineHttp
 * @param {boolean} input.magicdnsConfigured
 * @param {string} input.magicdnsStatus  One of PhaseStatus values.
 * @param {number|null} input.magicdnsHttp
 * @returns {{verdict: string, passed: boolean, detail: string}}
 */
export function evaluateDiagnostic(input) {
  const runtimeOk = input.runtimeOk === true;
  const baselineHealthy =
    input.baselineStatus === PhaseStatus.OK && is2xx(input.baselineHttp);
  const magicdnsHealthy =
    input.magicdnsStatus === PhaseStatus.OK && is2xx(input.magicdnsHttp);

  if (!input.magicdnsConfigured) {
    return {
      verdict: RunVerdict.INCOMPLETE,
      passed: false,
      detail: 'Tailscale 端点未配置 / 诊断未完成'
    };
  }
  if (!runtimeOk) {
    return { verdict: RunVerdict.FAIL, passed: false, detail: '运行环境未通过，诊断失败' };
  }
  if (!baselineHealthy) {
    return { verdict: RunVerdict.FAIL, passed: false, detail: '公网基线未通过，诊断失败' };
  }
  if (!magicdnsHealthy) {
    return { verdict: RunVerdict.FAIL, passed: false, detail: '手机Tailscale链路未通，诊断失败' };
  }
  return { verdict: RunVerdict.PASS, passed: true, detail: '链路通过' };
}