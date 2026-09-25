<script def>
{
  "navigationBarTitleText": "应用测试",
  "description": "Rokid Glasses 设备系统测试：语音唤起，唯一确认键按顺序检测运行时基础API、语音识别(zh-CN)、相机、扬声器/语音合成、公网HTTPS基线。本应用只做设备能力诊断，如实报告 ok/unsupported/failed，不作真实战斗/身份/健康判断。",
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
  runtimeProbeList,
  speechApiPresent,
  extractSpeechResult,
  describeSpeechStatus,
  cameraApiPresent,
  evaluateCamera,
  describeTrackSettings,
  speakerApiPresent,
  tryProbeSpeaker,
  baselineHealthy,
  NetworkState,
  formatLatency,
  withTimeout,
  OverallVerdict,
  VerdictLabels,
  StepId,
  evaluateDeviceRun
} from '../../lib/detector.js';

function nowClock() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function emptyStep(status = CapabilityState.UNKNOWN) {
  return { status, detail: '', metric: '' };
}

export default {
  data: {
    version: '0.2.2',
    clock: '--:--:--',
    phase: 'idle', // idle | running | done
    prototype: true,

    verdict: OverallVerdict.NOT_STARTED,
    verdictText: VerdictLabels[OverallVerdict.NOT_STARTED],
    verdictClass: 'idle',
    errorLine: '',

    // Five core steps, fixed order, compact rows.
    stepRuntime: emptyStep(),
    stepSpeech: emptyStep(),
    stepCamera: emptyStep(),
    stepSpeaker: emptyStep(),
    stepBaseline: emptyStep()
  },

  onLoad() {
    this.clockTimer = null;
    this.stream = null;
    this.recognition = null;
    this.runId = 0;
    this.caps = null;
    this.networkAbortController = null;
    this.BASELINE_URL = 'https://js.rokid.com/';
    this.PROBE_TIMEOUT_MS = 8000;
  },

  onShow() {
    this.updateClock();
    this.startClock();
  },

  onHide() {
    this.stopClock();
    this.cancelRun('page hidden');
  },

  onUnload() {
    this.stopClock();
    this.cancelRun('page unloaded');
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

  // --- Input: the ONLY physical operation is the confirm key ---------------
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
  },

  onConfirm() {
    if (this.data.phase === 'running') {
      this.stopDetect();
      return;
    }
    this.startDetect();
  },

  cleanupBeforeExit() {
    this.cancelRun('back pressed');
  },

  cancelRun(reason) {
    this.runId += 1;
    this.abortNetworkProbe(reason);
    this.releaseRecognition(reason);
    this.releaseStream(reason);
  },

  // --- Resource handlers ---------------------------------------------------
  releaseStream(reason) {
    if (this.stream) {
      try {
        for (const track of this.stream.getTracks()) track.stop();
      } catch (error) {
        console.log('[系统测试] stream release threw:', error);
      }
      this.stream = null;
    }
    if (reason) console.log('[系统测试] stream released:', reason);
  },

  releaseRecognition(reason) {
    const active = this.recognition;
    this.recognition = null;
    if (active) {
      try {
        active.abort();
      } catch (error) {
        console.log('[系统测试] recognition abort threw:', error);
      }
    }
    if (reason) console.log('[系统测试] recognition released:', reason);
  },

  abortNetworkProbe(reason) {
    if (this.networkAbortController) {
      try {
        this.networkAbortController.abort();
      } catch (error) {
        console.log('[系统测试] network abort threw:', error);
      }
      this.networkAbortController = null;
    }
    if (reason) console.log('[系统测试] network aborted:', reason);
  },

  detectionStillValid(runId) {
    return runId === this.runId;
  },

  // --- Runtime capability collection ---------------------------------------
  collectCaps() {
    if (this.caps) return this.caps;
    const md = typeof navigator !== 'undefined' && navigator.mediaDevices ? navigator.mediaDevices : null;
    const caps = {
      hasW3cCamera: !!(md && typeof md.getUserMedia === 'function'),
      hasImageCapture: typeof ImageCapture !== 'undefined',
      hasWxCamera: !!(typeof wx !== 'undefined' && wx.media && typeof wx.media.createCameraContext === 'function'),
      hasSpeechRecognition: typeof SpeechRecognition !== 'undefined' || typeof webkitSpeechRecognition !== 'undefined',
      hasSpeechSynthesis: typeof speechSynthesis !== 'undefined',
      hasSpeechSynthesisUtterance: typeof SpeechSynthesisUtterance !== 'undefined'
    };
    this.caps = caps;
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

  runRuntimeChecks() {
    const caps = this.collectCaps();
    const items = [];
    const report = (name, present, probe) => {
      const state = this.reportOneCapability(name, present, probe);
      items.push({ name, state });
      return state;
    };
    for (const p of runtimeProbeList()) {
      report(p.name, p.present(), p.probe);
    }
    const summary = summarizeCapabilities(
      items.reduce((acc, it) => {
        acc[it.name] = it.state;
        return acc;
      }, {})
    );
    return { pass: summary.pass, total: summary.total, allOk: summary.allOk, items };
  },

  // --- Speech recognition (zh-CN) -----------------------------------------
  runSpeechRecognition() {
    return new Promise((resolve) => {
      const caps = this.collectCaps();
      const Recognition = typeof SpeechRecognition !== 'undefined'
        ? SpeechRecognition
        : typeof webkitSpeechRecognition !== 'undefined'
          ? webkitSpeechRecognition
          : null;
      if (!speechApiPresent(caps) || !Recognition) {
        resolve({ status: CapabilityState.UNSUPPORTED, detail: '无语音识别API', metric: '' });
        return;
      }
      let recognition;
      try {
        recognition = new Recognition();
        recognition.lang = 'zh-CN';
        recognition.interimResults = true;
        recognition.continuous = false;
      } catch (error) {
        resolve({ status: CapabilityState.FAILED, detail: '识别初始化失败', metric: '' });
        return;
      }
      this.recognition = recognition;

      let gotFinal = false;
      let settled = false;
      const finish = (status, detail) => {
        if (settled) return;
        settled = true;
        try { recognition.abort(); } catch (e) { /* ignore */ }
        this.recognition = null;
        const metric = status === CapabilityState.OK ? '已获取最终语音结果' : '';
        resolve({ status, detail, metric });
      };

      // Correct use of result.isFinal: interim results never count as success.
      recognition.onresult = (event) => {
        const { text, final } = extractSpeechResult(event);
        if (final && text) gotFinal = true;
      };
      // Some embedded runtimes emit onerror without a subsequent onend.
      // Finish here so a speech failure cannot block camera/network checks.
      recognition.onerror = (event) => {
        const errorName = (event && event.error) || '识别出错';
        finish(CapabilityState.FAILED, describeSpeechStatus({ started: true, gotFinal, error: errorName }));
      };
      recognition.onend = () => {
        if (gotFinal) finish(CapabilityState.OK, '语音识别闭环成功');
        else finish(CapabilityState.FAILED, '未取得最终语音结果');
      };

      recognition.onstart = () => {
        this.setData({ stepSpeech: { ...this.data.stepSpeech, status: CapabilityState.UNKNOWN, metric: '识别中…' } });
      };

      try {
        recognition.start();
        // Embedded runtimes may neither emit onerror nor onend.
        setTimeout(() => {
          if (!settled) {
            finish(
              gotFinal ? CapabilityState.OK : CapabilityState.FAILED,
              gotFinal ? '语音识别闭环成功' : '识别未收到最终结果'
            );
          }
        }, 12000);
      } catch (error) {
        finish(CapabilityState.FAILED, '语音识别启动失败');
      }
    });
  },

  // --- Camera --------------------------------------------------------------
  async runCamera(runId) {
    const caps = this.collectCaps();
    const apiPresent = cameraApiPresent(caps);
    if (!apiPresent) {
      return { status: CapabilityState.UNSUPPORTED, detail: '无相机API', metric: '' };
    }
    try {
      let stream = null;
      if (caps.hasW3cCamera) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } else if (caps.hasWxCamera) {
        // wx CameraContext has no live MediaStreamTrack; CANNOT prove live video.
        return { status: CapabilityState.FAILED, detail: '仅wx相机上下文，无法证明实时画面', metric: '' };
      } else {
        return { status: CapabilityState.FAILED, detail: '无法请求相机', metric: '' };
      }
      if (!this.detectionStillValid(runId)) {
        if (stream) { for (const t of stream.getTracks()) t.stop(); }
        return null;
      }
      const tracks = stream.getVideoTracks();
      const track = tracks && tracks[0];
      const liveVideo = !!(track && track.readyState === 'live');
      const verdict = evaluateCamera({ apiPresent, liveVideo });
      this.setData({
        stepCamera: {
          status: verdict.state,
          detail: verdict.detail,
          metric: liveVideo && track ? describeTrackSettings(track.getSettings()) : ''
        }
      });
      if (liveVideo) this.stream = stream;
      else if (stream) { for (const t of stream.getTracks()) t.stop(); }
      return {
        status: verdict.state,
        detail: verdict.detail,
        metric: liveVideo && track ? describeTrackSettings(track.getSettings()) : ''
      };
    } catch (err) {
      const verdict = evaluateCamera({ apiPresent, liveVideo: false, error: (err && err.name) || CapabilityState.UNKNOWN });
      return { status: verdict.state, detail: verdict.detail, metric: '' };
    }
  },

  // --- Speaker / speech synthesis (detection only, no playback) ------------
  runSpeaker() {
    const caps = this.collectCaps();
    const usable = tryProbeSpeaker(caps);
    if (!speakerApiPresent(caps)) {
      return { status: CapabilityState.UNSUPPORTED, detail: '无语音合成API', metric: '' };
    }
    if (!usable) {
      return { status: CapabilityState.FAILED, detail: '语音合成表面异常', metric: '' };
    }
    return { status: CapabilityState.OK, detail: '语音合成可用（仅探测）', metric: '' };
  },

  // --- Public HTTPS baseline (status + latency only, no response body) -----
  async runBaseline(runId) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this.networkAbortController = controller;
    const startedAt = Date.now();
    try {
      let response;
      if (controller) {
        const timer = setTimeout(() => controller.abort(), this.PROBE_TIMEOUT_MS);
        try {
          response = await withTimeout(fetch(this.BASELINE_URL, { signal: controller.signal }), this.PROBE_TIMEOUT_MS, 'baseline');
        } finally {
          clearTimeout(timer);
        }
      } else {
        response = await withTimeout(fetch(this.BASELINE_URL), this.PROBE_TIMEOUT_MS, 'baseline');
      }
      if (!this.detectionStillValid(runId)) return null;
      const httpStatus = response && typeof response.status === 'number' ? response.status : null;
      const latencyMs = Date.now() - startedAt;
      // Deliberately do NOT read response.text()/json(): the body is untrusted.
      const ok = baselineHealthy(NetworkState.OK, httpStatus);
      const latency = formatLatency(latencyMs);
      return {
        status: ok ? CapabilityState.OK : CapabilityState.FAILED,
        detail: ok ? '公网基线健康' : httpStatus == null ? '未取得HTTP状态' : `HTTP ${httpStatus}`,
        metric: httpStatus == null ? latency : `HTTP ${httpStatus} · ${latency}`
      };
    } catch (error) {
      if (!this.detectionStillValid(runId)) return null;
      const message = error && error.message ? error.message : String(error);
      const isTimeout = /timed out|abort/i.test(message);
      const latency = formatLatency(Date.now() - startedAt);
      return {
        status: CapabilityState.FAILED,
        detail: isTimeout ? '公网请求超时' : '公网连接失败',
        metric: latency
      };
    } finally {
      if (this.networkAbortController === controller) this.networkAbortController = null;
    }
  },

  // --- Single confirm-driven run ------------------------------------------
  async startDetect() {
    const runId = ++this.runId;
    this.setData({
      phase: 'running',
      verdict: OverallVerdict.RUNNING,
      verdictText: VerdictLabels[OverallVerdict.RUNNING],
      verdictClass: 'running',
      errorLine: '',
      stepRuntime: emptyStep(CapabilityState.UNKNOWN),
      stepSpeech: emptyStep(CapabilityState.UNKNOWN),
      stepCamera: emptyStep(CapabilityState.UNKNOWN),
      stepSpeaker: emptyStep(CapabilityState.UNKNOWN),
      stepBaseline: emptyStep(CapabilityState.UNKNOWN)
    });

    const finalSteps = [];

    // ① Runtime / AIUI base API.
    const runtime = this.runRuntimeChecks();
    if (!this.detectionStillValid(runId)) return;
    const runtimeState = runtime.allOk ? CapabilityState.OK : CapabilityState.FAILED;
    this.setData({
      stepRuntime: {
        status: runtimeState,
        detail: runtime.allOk ? '基础API齐备' : `仅 ${runtime.pass}/${runtime.total} 项基础API可用`,
        metric: ''
      }
    });
    finalSteps.push({ id: StepId.RUNTIME, state: runtimeState });

    // ② Speech recognition (zh-CN) — actually starts a session.
    const speech = await this.runSpeechRecognition();
    if (!this.detectionStillValid(runId)) return;
    this.setData({ stepSpeech: speech });
    finalSteps.push({ id: StepId.SPEECH, state: speech.status });

    // ③ Camera (needs a live video track to be "ok").
    const camera = await this.runCamera(runId);
    if (camera === null || !this.detectionStillValid(runId)) return;
    finalSteps.push({ id: StepId.CAMERA, state: camera.status });

    // ④ Speaker / speech synthesis (surface detection only, no playback).
    const speaker = this.runSpeaker();
    if (!this.detectionStillValid(runId)) return;
    this.setData({ stepSpeaker: speaker });
    finalSteps.push({ id: StepId.SPEAKER, state: speaker.status });

    // ⑤ Public HTTPS baseline.
    const baseline = await this.runBaseline(runId);
    if (baseline === null || !this.detectionStillValid(runId)) return;
    this.setData({ stepBaseline: baseline });
    finalSteps.push({ id: StepId.BASELINE, state: baseline.status });

    this.releaseStream('run finished');
    this.finish({
      steps: finalSteps
    });
  },

  finish(result) {
    const verdict = evaluateDeviceRun(result);
    this.setData({
      phase: 'done',
      verdict: verdict.verdict,
      verdictText: VerdictLabels[verdict.verdict],
      verdictClass: verdict.verdict,
      errorLine: verdict.detail
    });
    console.log('[系统测试] run verdict:', verdict.verdict, verdict.detail);
  },

  stopDetect() {
    this.cancelRun('stopped by confirm');
    this.setData({
      phase: 'done',
      verdict: OverallVerdict.INCOMPLETE,
      verdictText: VerdictLabels[OverallVerdict.INCOMPLETE],
      verdictClass: 'incomplete',
      errorLine: '诊断已停止（确认键）'
    });
  }
};
</script>

<page>
  <view class="screen">
    <view class="header-row">
      <text class="title">应用测试</text>
      <text class="header-meta">设备能力诊断 · v{{version}} · {{clock}}</text>
    </view>

    <view class="proto-tag">
      <text class="proto-text">SYSTEM TEST — 仅在测设备能力，不判断战斗/身份/健康</text>
    </view>

    <view class="status-block">
      <text class="verdict verdict-{{verdictClass}}">{{verdictText}}</text>
      <text class="verdict-detail" wx:if="{{errorLine}}">{{errorLine}}</text>
    </view>

    <view class="steps">
      <view class="step-row">
        <text class="step-label">①</text>
        <text class="step-name">运行时基础API</text>
        <text class="step-metric" wx:if="{{stepRuntime.metric}}">{{stepRuntime.metric}}</text>
        <text class="step-state state-{{stepRuntime.status}}">{{stepRuntime.status == 'ok' ? 'OK' : stepRuntime.status == 'unsupported' ? '无' : stepRuntime.status == 'failed' ? '失败' : '…'}}</text>
      </view>

      <view class="step-row">
        <text class="step-label">②</text>
        <text class="step-name">语音zh-CN</text>
        <text class="step-metric" wx:if="{{stepSpeech.metric}}">{{stepSpeech.metric}}</text>
        <text class="step-state state-{{stepSpeech.status}}">{{stepSpeech.status == 'ok' ? 'OK' : stepSpeech.status == 'unsupported' ? '无' : stepSpeech.status == 'failed' ? '失败' : '…'}}</text>
      </view>

      <view class="step-row">
        <text class="step-label">③</text>
        <text class="step-name">相机</text>
        <text class="step-metric" wx:if="{{stepCamera.metric}}">{{stepCamera.metric}}</text>
        <text class="step-state state-{{stepCamera.status}}">{{stepCamera.status == 'ok' ? 'OK' : stepCamera.status == 'unsupported' ? '无' : stepCamera.status == 'failed' ? '失败' : '…'}}</text>
      </view>

      <view class="step-row">
        <text class="step-label">④</text>
        <text class="step-name">扬声器/合成</text>
        <text class="step-metric" wx:if="{{stepSpeaker.metric}}">{{stepSpeaker.metric}}</text>
        <text class="step-state state-{{stepSpeaker.status}}">{{stepSpeaker.status == 'ok' ? 'OK' : stepSpeaker.status == 'unsupported' ? '无' : stepSpeaker.status == 'failed' ? '失败' : '…'}}</text>
      </view>

      <view class="step-row">
        <text class="step-label">⑤</text>
        <text class="step-name">公网HTTPS</text>
        <text class="step-metric" wx:if="{{stepBaseline.metric}}">{{stepBaseline.metric}}</text>
        <text class="step-state state-{{stepBaseline.status}}">{{stepBaseline.status == 'ok' ? 'OK' : stepBaseline.status == 'unsupported' ? '无' : stepBaseline.status == 'failed' ? '失败' : '…'}}</text>
      </view>

      <text class="step-error" wx:if="{{errorLine && phase == 'done'}}">{{errorLine}}</text>
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
  top: 10px;
  width: 448px;
  height: 20px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 15px;
  font-weight: 500;
  color: #40ff5e;
  letter-spacing: 0.01em;
}

.header-meta {
  font-size: 9px;
  color: rgba(64, 255, 94, 0.48);
  font-family: monospace;
}

.proto-tag {
  position: absolute;
  left: 16px;
  top: 32px;
  width: 448px;
  height: 13px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
}

.proto-text {
  font-size: 9px;
  color: rgba(64, 255, 94, 0.48);
}

.status-block {
  position: absolute;
  left: 16px;
  top: 48px;
  width: 448px;
  height: 40px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
}

.verdict {
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(64, 255, 94, 0.48);
}

.verdict-complete {
  color: #40ff5e;
}

.verdict-partial {
  color: #40ff5e;
}

.verdict-failed {
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
  font-size: 10px;
  color: rgba(64, 255, 94, 0.72);
}

.steps {
  position: absolute;
  left: 16px;
  top: 96px;
  width: 448px;
  height: 200px;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid rgba(64, 255, 94, 0.24);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-height: 16px;
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
  width: 108px;
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

.step-state.state-failed {
  color: #40ff5e;
  font-weight: 500;
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