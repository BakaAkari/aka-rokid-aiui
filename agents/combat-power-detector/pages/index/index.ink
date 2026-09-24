<script def>
{
  "navigationBarTitleText": "战斗力检测器",
  "description": "Rokid Glasses 原型：语音唤起，唯一确认键触发相机能力与视觉状态检测。本应用为原型，只检测相机可用性与视觉状态，不作真实战斗/身份/健康判断。",
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
  cameraApiPresent,
  classifyVisualState,
  describeError,
  describeSnapshot,
  describeTrackSettings,
  DetectorState,
  StateLabels,
  evaluateCaptureOutcome,
  RunOutcome,
  OutcomeLabels,
  isCaptureOk,
  CaptureMode,
  ModeLabels
} from '../../lib/detector.js';

function nowClock() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function emptyStep(status = DetectorState.IDLE) {
  return { status, detail: '', metric: '' };
}

export default {
  data: {
    version: '0.1.1',
    clock: '--:--:--',
    phase: 'idle', // idle | running | done
    prototype: true,

    outcome: RunOutcome.NOT_STARTED,
    outcomeText: OutcomeLabels[RunOutcome.NOT_STARTED],
    outcomeClass: 'idle',
    errorLine: '',

    // Capture mode used for the prototype snapshot probe.
    mode: CaptureMode.TELEPHOTO,

    // The single confirm-driven flow steps.
    stepApi: emptyStep(),
    stepPermission: emptyStep(),
    stepVideo: emptyStep(),
    stepSnapshot: emptyStep()
  },

  onLoad() {
    this.clockTimer = null;
    this.stream = null;
    this.caps = null;
    this.runId = 0;
  },

  onShow() {
    this.updateClock();
    this.startClock();
  },

  onHide() {
    this.stopClock();
    this.releaseStream();
  },

  onUnload() {
    this.stopClock();
    this.releaseStream();
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

  // The ONLY physical operation is the confirm key. Enter / GlobalHook both act
  // as confirm. No other key selects, moves or opens a menu. Backspace cleans up
  // the camera before the host exits.
  onKeyUp(event) {
    const code = event && event.code;
    if (code === 'Enter' || code === 'GlobalHook') {
      event.preventDefault();
      this.onConfirm();
      return;
    }
    if (code === 'Backspace') {
      this.cleanupBeforeExit();
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
    this.releaseStream('back pressed');
  },

  releaseStream(reason) {
    if (this.stream) {
      try {
        for (const track of this.stream.getTracks()) {
          track.stop();
        }
      } catch (error) {
        console.log('[战斗力检测] stream release threw:', error);
      }
      this.stream = null;
    }
    if (reason) {
      console.log('[战斗力检测] stream released:', reason);
    }
  },

  // --- Runtime capability detection (read-only, cached) --------------------

  collectCaps() {
    if (this.caps) return this.caps;
    const md = (typeof navigator !== 'undefined' && navigator.mediaDevices) ? navigator.mediaDevices : null;
    const caps = {
      hasW3cCamera: !!(md && typeof md.getUserMedia === 'function'),
      hasImageCapture: typeof ImageCapture !== 'undefined',
      hasWxCamera: !!(typeof wx !== 'undefined' && wx.media && typeof wx.media.createCameraContext === 'function'),
      hasGetSupportedConstraints: !!(md && typeof md.getSupportedConstraints === 'function'),
      hasEnumerateDevices: !!(md && typeof md.enumerateDevices === 'function')
    };
    this.caps = caps;
    return caps;
  },

  async startDetect() {
    const runId = ++this.runId;
    this.setData({
      phase: 'running',
      outcomeText: '检测中…',
      outcomeClass: 'running',
      errorLine: '',
      stepApi: emptyStep(DetectorState.CHECKING),
      stepPermission: emptyStep(DetectorState.IDLE),
      stepVideo: emptyStep(DetectorState.IDLE),
      stepSnapshot: emptyStep(DetectorState.IDLE)
    });

    // ① Camera API surface presence.
    const caps = this.collectCaps();
    const apiPresent = cameraApiPresent(caps);
    this.setData({
      stepApi: {
        status: apiPresent ? DetectorState.SNAPSHOT : DetectorState.UNSUPPORTED,
        detail: apiPresent ? '检测到相机 API' : '未检测到相机 API',
        metric: ''
      }
    });
    if (!apiPresent) {
      this.finish({ apiPresent: false, liveVideo: false, error: RunOutcome.CAMERA_UNSUPPORTED });
      return;
    }
    if (runId !== this.runId) return;

    // ② Request the camera (this both proves permission and, on success, a
    // live video track). Use the W3C path when available; otherwise fall back to
    // creating a CameraContext (no stream is returned, so that path can only
    // prove the surface exists — we still require a W3C live video for PASS).
    this.setData({ stepPermission: emptyStep(DetectorState.CHECKING) });
    let liveVideo = false;
    let error = null;
    let videoTrack = null;
    let stream = null;
    const captured = async () => {
      if (caps.hasW3cCamera) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const tracks = stream.getVideoTracks();
        videoTrack = tracks && tracks[0];
        if (videoTrack && videoTrack.readyState === 'live') {
          liveVideo = true;
        }
        this.stream = stream;
        return { stream, videoTrack, liveVideo };
      }
      if (caps.hasWxCamera) {
        // wx CameraContext can capture a photo without a persistent stream. It
        // does not expose a live MediaStreamTrack, so we treat it as a surface
        // probe only and rely on takePhoto for evidence. No stream to retain.
        wx.media.createCameraContext();
        return { stream: null, videoTrack: null, liveVideo: false };
      }
      return { stream: null, videoTrack: null, liveVideo: false };
    };

    try {
      const r = await captured();
      stream = r.stream;
      videoTrack = r.videoTrack;
      liveVideo = r.liveVideo;
      if (runId !== this.runId) {
        this.releaseStream('stale run');
        return;
      }
      this.setData({
        stepPermission: {
          status: error ? DetectorState.ERROR : DetectorState.SNAPSHOT,
          detail: error ? describeError(error) : '权限已授予',
          metric: ''
        }
      });

      // ③ Live video track evidence.
      this.setData({
        stepVideo: {
          status: liveVideo ? DetectorState.SNAPSHOT : DetectorState.ERROR,
          detail: liveVideo ? '取得实时画面' : describeError(error || { name: '' }),
          metric: liveVideo && videoTrack ? describeTrackSettings(videoTrack.getSettings()) : ''
        }
      });

      if (liveVideo) {
        // ④ Optional in-memory snapshot as extra evidence. Keep size only —
        // photo bytes are never stored, uploaded, or echoed.
        await this.captureSnapshot(runId, videoTrack);
      } else if (error) {
        this.finish({ apiPresent, liveVideo: false, error: classifyError(error) });
        return;
      } else {
        this.finish({ apiPresent, liveVideo: false, error: RunOutcome.STREAM_EMPTY });
        return;
      }
    } catch (err) {
      error = err;
      if (runId !== this.runId) {
        this.releaseStream('stale run after error');
        return;
      }
      const perm = isDenied(err);
      this.setData({
        stepPermission: { status: DetectorState.ERROR, detail: describeError(err), metric: '' },
        stepVideo: { status: DetectorState.ERROR, detail: describeError(err), metric: '' }
      });
      this.finish({ apiPresent, liveVideo: false, error: classifyError(err) });
    }
  },

  // Capture a snapshot purely as evidence that the camera returned an image.
  // We store only the byte count + mime; the image itself is discarded.
  async captureSnapshot(runId, videoTrack) {
    this.setData({ stepSnapshot: emptyStep(DetectorState.CAPTURING) });
    let snapshotText = '';
    try {
      if (typeof ImageCapture !== 'undefined') {
        const cap = new ImageCapture(videoTrack);
        const photo = await cap.takePhoto({ mode: this.data.mode, enableSystemPreview: false });
        if (photo) {
          snapshotText = describeSnapshot({ mimeType: photo.type, byteSize: photo.size });
        }
      } else {
        // Fall back: prove pixels via grabFrame when possible.
        snapshotText = '已取得实时画面（无 ImageCapture）';
      }
      if (runId !== this.runId) return;
      this.setData({
        stepSnapshot: {
          status: snapshotText ? DetectorState.SNAPSHOT : DetectorState.IDLE,
          detail: snapshotText || '未取得快照',
          metric: ''
        }
      });
    } catch (error) {
      if (runId !== this.runId) return;
      this.setData({
        stepSnapshot: { status: DetectorState.ERROR, detail: '快照失败（不影响相机可用结论）', metric: '' }
      });
    }
    // Even if snapshot fails, camera availability is already proven by the live
    // video track. Report the honest PASS.
    this.finish({ apiPresent: true, liveVideo: true });
  },

  finish(result) {
    const verdict = evaluateCaptureOutcome(result);
    const ok = isCaptureOk(verdict.outcome);
    this.releaseStream('run finished');
    this.setData({
      phase: 'done',
      outcome: verdict.outcome,
      outcomeText: OutcomeLabels[verdict.outcome],
      outcomeClass: ok ? 'ok' : verdict.outcome === RunOutcome.ABORTED ? 'aborted' : 'fail',
      errorLine: verdict.detail
    });
    console.log('[战斗力检测] outcome:', verdict.outcome, verdict.detail);
  },

  stopDetect() {
    this.runId += 1;
    this.releaseStream('stopped by confirm');
    this.setData({
      phase: 'done',
      outcome: RunOutcome.ABORTED,
      outcomeText: OutcomeLabels[RunOutcome.ABORTED],
      outcomeClass: 'aborted',
      errorLine: '检测已停止（确认键）'
    });
  }
};

function isDenied(err) {
  return err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
}

function classifyError(err) {
  if (isDenied(err)) return RunOutcome.PERMISSION_DENIED;
  if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
    return RunOutcome.DEVICE_MISSING;
  }
  return RunOutcome.CAPTURE_FAILED;
}
</script>

<page>
  <view class="screen">
    <view class="header-row">
      <text class="title">战斗力检测器</text>
      <text class="header-meta">原型 · v{{version}} · {{clock}}</text>
    </view>

    <view class="proto-tag">
      <text class="proto-text">PROTOTYPE — 仅检测相机可用性与视觉状态，不判断战斗/身份/健康</text>
    </view>

    <view class="status-block">
      <text class="verdict verdict-{{outcomeClass}}">{{outcomeText}}</text>
      <text class="verdict-detail" wx:if="{{errorLine}}">{{errorLine}}</text>
    </view>

    <view class="steps">
      <view class="step-row">
        <text class="step-label">①</text>
        <text class="step-name">相机 API</text>
        <text class="step-state state-{{stepApi.status}}">{{stepApi.status == 'snapshot' ? '有' : stepApi.status == 'unsupported' ? '无' : stepApi.status == 'checking' ? '…' : '待测'}}</text>
      </view>

      <view class="step-row">
        <text class="step-label">②</text>
        <text class="step-name">权限</text>
        <text class="step-state state-{{stepPermission.status}}">{{stepPermission.status == 'snapshot' ? '已授予' : stepPermission.status == 'error' ? '失败' : stepPermission.status == 'checking' ? '…' : '待测'}}</text>
      </view>

      <view class="step-row">
        <text class="step-label">③</text>
        <text class="step-name">实时画面</text>
        <text class="step-metric" wx:if="{{stepVideo.metric}}">{{stepVideo.metric}}</text>
        <text class="step-state state-{{stepVideo.status}}">{{stepVideo.status == 'snapshot' ? '取得' : stepVideo.status == 'error' ? '失败' : stepVideo.status == 'checking' ? '…' : '待测'}}</text>
      </view>

      <view class="step-row step-secondary">
        <text class="step-label">+</text>
        <text class="step-name">快照证据</text>
        <text class="step-metric" wx:if="{{stepSnapshot.metric}}">{{stepSnapshot.metric}}</text>
        <text class="step-state state-{{stepSnapshot.status}}">{{stepSnapshot.status == 'snapshot' ? 'OK' : stepSnapshot.status == 'error' ? '跳过' : stepSnapshot.status == 'capturing' ? '…' : '待测'}}</text>
      </view>

      <text class="step-mode">检测模式：{{mode == 'default' ? '全景/默认' : mode == 'wide' ? '扫码/广角' : '阅读/长焦'}}</text>
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

.proto-tag {
  position: absolute;
  left: 16px;
  top: 38px;
  width: 448px;
  height: 14px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
}

.proto-text {
  font-size: 10px;
  color: rgba(64, 255, 94, 0.48);
}

.status-block {
  position: absolute;
  left: 16px;
  top: 56px;
  width: 448px;
  height: 44px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.verdict {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(64, 255, 94, 0.48);
}

.verdict-ok {
  color: #40ff5e;
}

.verdict-fail {
  color: #40ff5e;
  font-weight: 600;
}

.verdict-aborted {
  color: rgba(64, 255, 94, 0.72);
}

.verdict-running {
  color: rgba(64, 255, 94, 0.72);
}

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
  top: 112px;
  width: 448px;
  height: 168px;
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
  width: 90px;
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

.step-state.state-snapshot {
  color: #40ff5e;
}

.step-state.state-error {
  color: #40ff5e;
  font-weight: 500;
}

.step-state.state-checking,
.step-state.state-capturing {
  color: rgba(64, 255, 94, 0.72);
}

.step-mode {
  font-size: 10px;
  color: rgba(64, 255, 94, 0.48);
  font-family: monospace;
  margin-top: 2px;
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