<script def>
{
  "navigationBarTitleText": "连线诊断",
  "description": "Rokid Glasses 单页连线诊断：运行时能力自检、公网 HTTPS 基线、手机 Tailscale MagicDNS。语音唤起应用，唯一物理操作是确认键（开始/停止/重试）；不依赖方向键、触摸或菜单选择。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {},
      "required": []
    }
  }
}
</script>

<script setup>
import {
  CapabilityState,
  classifyCapability,
  summarizeCapabilities,
  formatLatency,
  clipDiagnostics,
  withTimeout,
  DefaultEndpoint,
  isHttpsUrl,
  PhaseId,
  PhaseStatus,
  RunVerdict,
  VerdictLabels,
  evaluateDiagnostic
} from '../../lib/probe.js';

function nowClock() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function emptyStep(status = PhaseStatus.IDLE) {
  return {
    status,
    http: null,
    latency: 'N/A',
    detail: '',
    configured: false,
    pass: 0,
    total: 0
  };
}

export default {
  data: {
    version: '1.0.1',
    clock: '--:--:--',

    // Single confirm-driven run state.
    phase: 'idle', // idle | running | done
    verdictText: VerdictLabels[RunVerdict.NOT_STARTED],
    verdictClass: 'idle',
    errorLine: '',

    // The three core steps (max three), shown top-to-bottom.
    stepRuntime: emptyStep(),
    stepBaseline: emptyStep(),
    stepMagicdns: emptyStep(),
    // Optional secondary diagnosis (Tailscale IP) — never part of PASS verdict.
    stepIp: emptyStep()
  },

  // --- Lifecycle ----------------------------------------------------------

  onLoad(query) {
    this.recognition = null;
    this.networkRequestId = 0;
    this.networkAbortController = null;
    this.clockTimer = null;
    this.capsCache = null;
    this.runtimeOk = false;

    // Startup args: only https:// is accepted (baseline/magicdns/ip/url all
    // remain supported for compat). No private IP, domain, token or Hermes key
    // is baked into the source; these come from the caller at launch.
    const q = query || {};
    const read = (key) => (typeof q[key] === 'string' ? q[key].trim() : '');
    const baseline = read('baseline');
    const magicdns = read('magicdns');
    const ip = read('ip');
    const url = read('url');

    // Main flow must be honest: MagicDNS configured flag decides completeness.
    this.magicdnsConfigured = isHttpsUrl(magicdns);
    this.baselineUrl = isHttpsUrl(baseline)
      ? baseline
      : isHttpsUrl(url)
        ? url
        : DefaultEndpoint;
    this.magicdnsUrl = this.magicdnsConfigured ? magicdns : '';
    this.ipUrl = isHttpsUrl(ip) ? ip : '';

    if (!this.magicdnsConfigured) {
      this.setData({
        stepMagicdns: { ...emptyStep(PhaseStatus.SKIP), configured: false }
      });
    }
  },

  onShow() {
    this.updateClock();
    this.startClock();
    // Re-evaluate runtime capability presence once when the page appears.
    this.collectCapabilities(true);
  },

  onHide() {
    this.stopClock();
    this.abortNetworkProbe('page hidden');
  },

  onUnload() {
    this.stopClock();
    this.abortNetworkProbe('page unloaded');
    this.releaseRecognition('page unloaded');
  },

  startClock() {
    this.stopClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);
  },

  stopClock() {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  },

  updateClock() {
    this.setData({ clock: nowClock() });
  },

  // --- Input --------------------------------------------------------------

  // The ONLY physical operation is the confirm key. Enter / GlobalHook both act
  // as confirm. No other key ever selects, moves or opens a menu; other keys are
  // left to the host. Backspace cleans up before the host exits/returns.
  onKeyUp(event) {
    const code = event && event.code;
    if (code === 'Enter' || code === 'GlobalHook') {
      event.preventDefault();
      this.onConfirm();
      return;
    }
    if (code === 'Backspace') {
      this.cleanupBeforeExit();
      // No preventDefault: host back behaviour applies after we clean up.
    }
    // Any other key: deliberately a no-op, so it cannot act as a selection.
  },

  onConfirm() {
    if (this.data.phase === 'running') {
      this.stopDiagnostic();
      return;
    }
    // idle or done -> start (a repeat is a retry).
    this.startDiagnostic();
  },

  cleanupBeforeExit() {
    this.abortNetworkProbe('back pressed');
    this.releaseRecognition('back pressed');
  },

  releaseRecognition(reason) {
    const active = this.recognition;
    this.recognition = null;
    if (active) {
      try {
        active.abort();
      } catch (error) {
        console.log('[连线诊断] abort threw:', error);
      }
    }
    if (reason) {
      console.log('[连线诊断] recognition released:', reason);
    }
  },

  // --- Runtime self-check (phase ①) ---------------------------------------

  // Capability *presence* is a pure read, cached so onShow() doesn't spam.
  // SpeechRecognition is just one capability row here — there is no separate
  // voice-test panel or live transcript UI.
  collectCapabilities(allowRefresh) {
    if (!allowRefresh && this.capsCache) {
      return this.capsCache;
    }
    const caps = {
      SpeechRecognition: typeof SpeechRecognition !== 'undefined',
      fetch: typeof fetch === 'function',
      Headers: typeof Headers !== 'undefined',
      Response: typeof Response !== 'undefined',
      ReadableStream: typeof ReadableStream !== 'undefined',
      TextDecoder: typeof TextDecoder !== 'undefined',
      crypto: typeof crypto !== 'undefined',
      navigator: typeof navigator !== 'undefined',
      mediaDevices: !!(typeof navigator !== 'undefined' && navigator.mediaDevices),
      AbortController: typeof AbortController !== 'undefined'
    };
    this.capsCache = caps;
    return caps;
  },

  reportOneCapability(name, present, probe) {
    let probeError = null;
    if (present && typeof probe === 'function') {
      try {
        probe();
      } catch (error) {
        probeError = error;
      }
    }
    return classifyCapability(present, probeError);
  },

  // Returns { pass, total, allOk, items }.
  runRuntimeChecks() {
    const caps = this.collectCapabilities(false);
    const items = [];
    const report = (name, present, probe) => {
      const state = this.reportOneCapability(name, present, probe);
      items.push({ name, state });
      return state;
    };

    report('SpeechRecognition', caps.SpeechRecognition, () => {
      const r = new SpeechRecognition();
      r.lang = 'zh-CN';
    });
    report('fetch', caps.fetch, () => {
      if (typeof fetch !== 'function') return;
      fetch('data:text/plain,ok').catch(() => {});
    });
    report('Headers', caps.Headers, () => {
      const h = new Headers([['a', '1'], ['a', '2']]);
      if (!h.get('A')) throw new Error('Headers lookup failed');
    });
    report('Response', caps.Response, () => {
      const r = new Response('ok');
      if (r.status !== 200) throw new Error('Response status mismatch');
    });
    report('ReadableStream', caps.ReadableStream, () => {});
    report('TextDecoder', caps.TextDecoder, () => {
      const d = new TextDecoder('utf-8');
      if (d.decode(new Uint8Array([0x41])) !== 'A') throw new Error('decode failed');
    });
    report('crypto.randomUUID', caps.crypto, () => {
      if (typeof crypto.randomUUID !== 'function') throw new Error('no randomUUID');
    });
    report('AbortController', caps.AbortController, () => {
      if (typeof AbortController !== 'function') throw new Error('no AbortController');
    });
    report('navigator.mediaDevices', caps.mediaDevices, () => {
      if (!caps.mediaDevices) return;
      if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('no getUserMedia');
      }
    });

    const summary = summarizeCapabilities(
      items.reduce((acc, it) => {
        acc[it.name] = it.state;
        return acc;
      }, {})
    );
    return {
      pass: summary.pass,
      total: summary.total,
      allOk: summary.allOk,
      items
    };
  },

  // --- Network probe ------------------------------------------------------

  PROBE_TIMEOUT_MS: 8000,

  abortNetworkProbe(reason) {
    this.networkRequestId += 1;
    if (this.networkAbortController) {
      try {
        this.networkAbortController.abort();
      } catch (error) {
        console.log('[连线诊断] network abort threw:', error);
      }
      this.networkAbortController = null;
    }
    if (reason) {
      console.log('[连线诊断] network probe aborted:', reason);
    }
  },

  probeStillValid(runId, controller) {
    return (
      runId === this.networkRequestId &&
      this.networkAbortController === controller
    );
  },

  /**
   * One bounded, cancellable https probe that NEVER reads the response body and
   * never echoes the URL — the only surface is an ok/http/latency/diagnostic
   * triplet, so tokens/query strings and the body cannot leak onto screen.
   * @returns {Promise<{ok: boolean, status: string, httpStatus: number|null, elapsedMs: number, diagnostic: string}>}
   */
  async performSafeFetch(url, controller, startedAt) {
    const timeoutMs = this.PROBE_TIMEOUT_MS;
    try {
      let response;
      if (typeof AbortController !== 'undefined') {
        const timer = setTimeout(() => {
          if (controller) {
            controller.abort();
          }
        }, timeoutMs);
        try {
          response = await withTimeout(
            fetch(url, controller ? { signal: controller.signal } : undefined),
            timeoutMs,
            'probe'
          );
        } finally {
          clearTimeout(timer);
        }
      } else {
        response = await withTimeout(fetch(url), timeoutMs, 'probe');
      }
      const elapsedMs = Date.now() - startedAt;
      const httpStatus =
        response && typeof response.status === 'number' ? response.status : null;
      // Deliberately do NOT read response.text()/json(): body is untrusted and
      // may contain sensitive data we never want on screen or in logs.
      if (response && response.ok && httpStatus != null) {
        return {
          ok: true,
          status: PhaseStatus.OK,
          httpStatus,
          elapsedMs,
          diagnostic: ''
        };
      }
      return {
        ok: false,
        status: PhaseStatus.FAIL,
        httpStatus,
        elapsedMs,
        diagnostic: httpStatus == null ? '未返回HTTP状态' : `非2xx HTTP ${httpStatus}`
      };
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const message = error && error.message ? error.message : String(error);
      const isTimeout = /timed out|abort/i.test(message);
      // Do not include the URL in the on-screen diagnostic.
      return {
        ok: false,
        status: isTimeout ? PhaseStatus.FAIL : PhaseStatus.FAIL,
        httpStatus: null,
        elapsedMs,
        diagnostic: isTimeout ? '请求超时' : clipDiagnostics(message, 44)
      };
    }
  },

  async runStep(url, controller, runId) {
    if (!url) {
      return { ok: false, status: PhaseStatus.SKIP, httpStatus: null, elapsedMs: 0, diagnostic: '' };
    }
    const startedAt = Date.now();
    const result = await this.performSafeFetch(url, controller, startedAt);
    if (!this.probeStillValid(runId, controller)) {
      return null; // cancelled / stopped
    }
    result.latencyText = formatLatency(Date.now() - startedAt);
    return result;
  },

  // --- Single-run flow ----------------------------------------------------

  async startDiagnostic() {
    const runId = ++this.networkRequestId;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this.networkAbortController = controller;

    this.setData({
      phase: 'running',
      verdictText: VerdictLabels[RunVerdict.RUNNING],
      verdictClass: 'running',
      errorLine: '',
      stepRuntime: { ...emptyStep(PhaseStatus.RUNNING) },
      stepBaseline: { ...emptyStep(PhaseStatus.RUNNING) },
      stepMagicdns: {
        ...emptyStep(this.magicdnsConfigured ? PhaseStatus.RUNNING : PhaseStatus.SKIP),
        configured: this.magicdnsConfigured
      },
      stepIp: {
        ...emptyStep(this.ipUrl ? PhaseStatus.RUNNING : PhaseStatus.SKIP),
        configured: !!this.ipUrl
      }
    });
    this.networkAbortController = controller;

    // ① Runtime self-check.
    const runtime = this.runRuntimeChecks();
    if (!this.probeStillValid(runId, controller)) return;
    this.runtimeOk = runtime.allOk;
    this.setData({
      stepRuntime: {
        status: runtime.allOk ? PhaseStatus.OK : PhaseStatus.FAIL,
        pass: runtime.pass,
        total: runtime.total,
        latency: 'N/A'
      }
    });

    // ② Public HTTPS baseline.
    const baseline = await this.runStep(this.baselineUrl, controller, runId);
    if (!this.probeStillValid(runId, controller)) return;
    this.setData({
      stepBaseline: {
        status: baseline.ok ? PhaseStatus.OK : PhaseStatus.FAIL,
        http: baseline.httpStatus,
        latency: baseline.latencyText,
        detail: baseline.diagnostic
      }
    });

    // ③ Tailscale MagicDNS HTTPS (only if injected).
    if (this.magicdnsConfigured) {
      const md = await this.runStep(this.magicdnsUrl, controller, runId);
      if (!this.probeStillValid(runId, controller)) return;
      this.setData({
        stepMagicdns: {
          status: md.ok ? PhaseStatus.OK : PhaseStatus.FAIL,
          http: md.httpStatus,
          latency: md.latencyText,
          detail: md.diagnostic,
          configured: true
        }
      });
    }

    // Optional Tailscale IP — secondary only, never enters the main verdict.
    if (this.ipUrl) {
      const ipr = await this.runStep(this.ipUrl, controller, runId);
      if (!this.probeStillValid(runId, controller)) return;
      this.setData({
        stepIp: {
          status: ipr.ok ? PhaseStatus.OK : PhaseStatus.FAIL,
          http: ipr.httpStatus,
          latency: ipr.latencyText,
          detail: ipr.diagnostic,
          configured: true
        }
      });
    }

    const verdict = evaluateDiagnostic({
      runtimeOk: this.runtimeOk,
      baselineStatus: this.data.stepBaseline.status,
      baselineHttp: this.data.stepBaseline.http,
      magicdnsConfigured: this.magicdnsConfigured,
      magicdnsStatus: this.data.stepMagicdns.status,
      magicdnsHttp: this.data.stepMagicdns.http
    });
    this.networkAbortController = null;
    this.setData({
      phase: 'done',
      verdictText: VerdictLabels[verdict.verdict],
      verdictClass: verdict.verdict,
      errorLine: verdict.detail
    });
    console.log('[连线诊断] run verdict:', verdict.verdict, verdict.detail);
  },

  stopDiagnostic() {
    this.abortNetworkProbe('stopped by confirm');
    this.setData({
      phase: 'done',
      verdictText: '已停止',
      verdictClass: 'fail',
      errorLine: '诊断已停止（确认键）'
    });
  }
};
</script>

<page>
  <view class="screen">
    <view class="header-row">
      <text class="title">连线诊断</text>
      <text class="header-meta">v{{version}} · {{clock}}</text>
    </view>

    <view class="status-block">
      <text class="verdict verdict-{{verdictClass}}">{{verdictText}}</text>
      <text class="verdict-detail" wx:if="{{errorLine}}">{{errorLine}}</text>
    </view>

    <view class="steps">
      <!-- 运行环境 -->
      <view class="step-row">
        <text class="step-label">①</text>
        <text class="step-name">运行环境</text>
        <text class="step-state state-{{stepRuntime.status}}">{{stepRuntime.status == 'ok' ? stepRuntime.pass + '/' + stepRuntime.total : stepRuntime.status == 'running' ? '…' : stepRuntime.status == 'fail' ? '失败' : stepRuntime.status == 'skip' ? '跳过' : '待测'}}</text>
      </view>

      <!-- 公网 -->
      <view class="step-row">
        <text class="step-label">②</text>
        <text class="step-name">公网基线</text>
        <text class="step-metric" wx:if="{{stepBaseline.http != null}}">HTTP {{stepBaseline.http}} · {{stepBaseline.latency}}</text>
        <text class="step-state state-{{stepBaseline.status}}">{{stepBaseline.status == 'ok' ? 'OK' : stepBaseline.status == 'running' ? '…' : stepBaseline.status == 'fail' ? '失败' : stepBaseline.status == 'skip' ? '跳过' : '待测'}}</text>
      </view>

      <!-- 手机Tailscale -->
      <view class="step-row">
        <text class="step-label">③</text>
        <text class="step-name">手机Tailscale</text>
        <text class="step-metric" wx:if="{{stepMagicdns.http != null}}">HTTP {{stepMagicdns.http}} · {{stepMagicdns.latency}}</text>
        <text class="step-state state-{{stepMagicdns.status}}">{{!stepMagicdns.configured ? '未配置' : stepMagicdns.status == 'ok' ? 'OK' : stepMagicdns.status == 'running' ? '…' : stepMagicdns.status == 'fail' ? '失败' : stepMagicdns.status == 'skip' ? '跳过' : '待测'}}</text>
      </view>

      <!-- 可选：Tailscale IP（次级诊断，不参与主判定） -->
      <view class="step-row step-secondary" wx:if="{{stepIp.configured}}">
        <text class="step-label">+</text>
        <text class="step-name">可选Tailscale IP</text>
        <text class="step-metric" wx:if="{{stepIp.http != null}}">HTTP {{stepIp.http}} · {{stepIp.latency}}</text>
        <text class="step-state state-{{stepIp.status}}">{{stepIp.status == 'ok' ? 'OK' : stepIp.status == 'running' ? '…' : stepIp.status == 'fail' ? '失败' : '待测'}}</text>
      </view>

      <text class="step-error" wx:if="{{stepBaseline.detail && stepBaseline.status == 'fail'}}">{{stepBaseline.detail}}</text>
      <text class="step-error" wx:if="{{stepMagicdns.detail && stepMagicdns.status == 'fail'}}">{{stepMagicdns.detail}}</text>
      <text class="step-error" wx:if="{{stepIp.detail && stepIp.status == 'fail'}}">{{stepIp.detail}}</text>
    </view>

    <view class="hint-row">
      <text class="hint">{{phase == 'running' ? '确认：停止' : phase == 'done' ? '确认：重试' : '确认：开始'}}</text>
      <text class="hint">语音唤起 · 仅本机验证</text>
    </view>
  </view>
</page>

<style>
.screen {
  position: relative;
  width: 480px;
  height: 352px;
  box-sizing: border-box;
  background-color: #000000;
  color: rgba(64, 255, 94, 0.72);
  font-family: sans-serif;
  overflow: hidden;
}

.header-row {
  position: absolute;
  left: 16px;
  top: 12px;
  width: 448px;
  height: 22px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 16px;
  font-weight: 500;
  color: #40ff5e;
  letter-spacing: 0.01em;
}

.header-meta {
  font-size: 10px;
  color: rgba(64, 255, 94, 0.48);
  font-family: monospace;
}

.status-block {
  position: absolute;
  left: 16px;
  top: 46px;
  width: 448px;
  height: 48px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.verdict {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(64, 255, 94, 0.48);
}

.verdict-pass {
  color: #40ff5e;
}

.verdict-fail {
  color: #40ff5e;
  font-weight: 600;
}

.verdict-running {
  color: rgba(64, 255, 94, 0.72);
}

.verdict-incomplete,
.verdict-not_started,
.verdict-idle {
  color: rgba(64, 255, 94, 0.48);
}

.verdict-detail {
  font-size: 11px;
  color: rgba(64, 255, 94, 0.72);
}

.steps {
  position: absolute;
  left: 16px;
  top: 106px;
  width: 448px;
  height: 176px;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid rgba(64, 255, 94, 0.24);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.step-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-height: 18px;
}

.step-row.step-secondary {
  opacity: 0.6;
}

.step-label {
  font-size: 12px;
  color: rgba(64, 255, 94, 0.48);
  font-family: monospace;
  width: 14px;
}

.step-name {
  font-size: 13px;
  font-weight: 500;
  color: #40ff5e;
  width: 118px;
}

.step-metric {
  font-size: 10px;
  color: rgba(64, 255, 94, 0.48);
  font-family: monospace;
  flex: 1;
}

.step-state {
  font-size: 11px;
  font-family: monospace;
  color: rgba(64, 255, 94, 0.48);
}

.step-state.state-ok {
  color: #40ff5e;
}

.step-state.state-fail {
  color: #40ff5e;
  font-weight: 500;
}

.step-state.state-running {
  color: rgba(64, 255, 94, 0.72);
}

.step-error {
  font-size: 10px;
  line-height: 13px;
  color: rgba(64, 255, 94, 0.72);
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hint-row {
  position: absolute;
  left: 16px;
  bottom: 8px;
  width: 448px;
  height: 12px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.hint {
  font-size: 10px;
  color: rgba(64, 255, 94, 0.48);
}
</style>