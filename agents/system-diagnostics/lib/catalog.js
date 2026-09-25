export const EvidenceState = Object.freeze({
  VERIFIED: 'verified',
  SURFACE: 'surface',
  UNSUPPORTED: 'unsupported',
  UNAVAILABLE: 'unavailable',
  FAILED: 'failed',
  NOT_RUN: 'not-run',
  RUNNING: 'running'
});

export const StateLabels = Object.freeze({
  verified: '实证', surface: '表面', unsupported: '不支持', unavailable: '无接口',
  failed: '失败', 'not-run': '未执行', running: '测试中'
});

export const CapabilityCatalog = Object.freeze([
  { id: 'runtime.core', group: '运行时', label: 'JS核心运行时', mode: 'auto', source: 'documentation/3-api' },
  { id: 'runtime.streams', group: '运行时', label: '流与编码', mode: 'auto', source: 'documentation/3-api/network/streams.md' },
  { id: 'runtime.url', group: '运行时', label: 'URL与参数解析', mode: 'auto', source: 'documentation/3-api/network/url.md' },
  { id: 'runtime.performance', group: '运行时', label: '时钟与性能', mode: 'auto', source: 'Web runtime surface' },
  { id: 'display.viewport', group: '显示交互', label: '480×352视口', mode: 'auto', source: 'design/monochrome' },
  { id: 'display.canvas', group: '显示交互', label: 'Canvas绘制', mode: 'auto', source: 'documentation/3-api/canvas/index.md' },
  { id: 'input.confirm', group: '显示交互', label: '确认键事件', mode: 'verified-by-run', source: 'AIUI key lifecycle' },
  { id: 'lifecycle.page', group: '显示交互', label: '页面生命周期', mode: 'verified-by-run', source: 'documentation/1-framework/open-agent-format/page-lifecycle.md' },
  { id: 'page.world', group: '显示交互', label: '环境感知', mode: 'interactive', source: 'documentation/3-api/framework/page.md' },
  { id: 'page.headgesture', group: '显示交互', label: '头部手势事件', mode: 'human', source: 'documentation/3-api/framework/page.md' },
  { id: 'page.voicewakeup', group: '显示交互', label: '语音唤醒事件', mode: 'human', source: 'documentation/3-api/framework/page.md' },
  { id: 'speech.mic', group: '音频AI', label: '麦克风识别zh-CN', mode: 'interactive', source: 'documentation/3-api/ai/speech-recognition.md' },
  { id: 'speech.session', group: '音频AI', label: '分段识别Session', mode: 'surface', source: 'documentation/3-api/ai/speech-recognition.md' },
  { id: 'audio.synthesis', group: '音频AI', label: '语音合成播放', mode: 'interactive', source: 'documentation/3-api/ai/speech-synthesis.md' },
  { id: 'audio.webaudio', group: '音频AI', label: 'Web Audio', mode: 'auto', source: 'documentation/3-api/media/web-audio.md' },
  { id: 'audio.player', group: '音频AI', label: 'AudioPlayer', mode: 'surface', source: 'documentation/3-api/media/audio-player.md' },
  { id: 'ai.language', group: '音频AI', label: 'LanguageModel', mode: 'auto', source: 'documentation/3-api/ai/language-model.md' },
  { id: 'camera.live', group: '视觉', label: '相机实时视频轨', mode: 'interactive', source: 'MediaDevices/ImageCapture' },
  { id: 'camera.imagecapture', group: '视觉', label: 'ImageCapture', mode: 'surface', source: 'AIUI media surface' },
  { id: 'camera.devices', group: '视觉', label: '媒体设备枚举', mode: 'auto', source: 'documentation/3-api/media/media-capture.md' },
  { id: 'camera.recorder', group: '视觉', label: 'MediaRecorder', mode: 'surface', source: 'documentation/3-api/media/media-capture.md' },
  { id: 'vision.barcode', group: '视觉', label: '条码识别格式', mode: 'auto', source: 'documentation/3-api/device/barcode.md' },
  { id: 'sensor.accelerometer', group: '传感器', label: '加速度计', mode: 'auto', source: 'documentation/3-api/device/accelerometer.md' },
  { id: 'sensor.gyroscope', group: '传感器', label: '陀螺仪', mode: 'auto', source: 'documentation/3-api/device/gyroscope.md' },
  { id: 'sensor.orientation', group: '传感器', label: '绝对方向姿态', mode: 'auto', source: 'documentation/3-api/device/absolute-orientation-sensor.md' },
  { id: 'sensor.magnetometer', group: '传感器', label: '磁力计（示例接口）', mode: 'sample-only', source: 'samples/capabilities/pages/magnetometer (no API contract)' },
  { id: 'device.battery', group: '设备信息', label: '电池状态', mode: 'auto', source: 'documentation/3-api/device/battery-manager.md' },
  { id: 'device.info', group: '设备信息', label: '非敏感环境信息', mode: 'auto', source: 'Navigator safe fields' },
  { id: 'geo.position', group: '设备信息', label: '定位能力', mode: 'interactive', source: 'documentation/3-api/geo-data/geolocation.md' },
  { id: 'bluetooth.availability', group: '连接', label: '蓝牙可用性', mode: 'auto', source: 'documentation/3-api/device/bluetooth.md' },
  { id: 'bluetooth.device', group: '连接', label: 'BLE外设连接', mode: 'external', source: 'documentation/3-api/device/bluetooth.md' },
  { id: 'network.https', group: '网络', label: '公网HTTPS', mode: 'auto', source: 'documentation/3-api/network/https.md' },
  { id: 'network.wxhttps', group: '网络', label: 'wx.request HTTPS', mode: 'auto', source: 'documentation/3-api/network/https.md' },
  { id: 'network.websocket', group: '网络', label: 'WebSocket接口', mode: 'surface', source: 'documentation/3-api/network/websocket.md' },
  { id: 'network.sse', group: '网络', label: 'EventSource接口', mode: 'surface', source: 'documentation/3-api/network/event-source.md' },
  { id: 'network.mobileproxy', group: '网络', label: '手机Mobile Proxy', mode: 'inferred', source: 'documentation/0-guide/basic/network/usage.md' },
  { id: 'storage.local', group: '存储', label: 'localStorage读写', mode: 'auto', source: 'documentation/3-api/storage.md' },
  { id: 'storage.wx', group: '存储', label: 'wx Storage读写', mode: 'auto', source: 'documentation/3-api/storage-api.md' },
  { id: 'storage.manager', group: '存储', label: 'StorageManager', mode: 'auto', source: 'documentation/3-api/storage/opfs.md' },
  { id: 'storage.opfs', group: '存储', label: 'OPFS读写', mode: 'auto', source: 'documentation/3-api/storage/opfs.md' },
  { id: 'native.cxrs', group: '原生层', label: 'CXR-S裸机能力', mode: 'layer', source: 'open.rokid.com CXR-S' },
  { id: 'system.private', group: '原生层', label: '序列号/温度/存储量', mode: 'layer', source: 'No public AIUI API' }
]);

export function createResult(cap, state = EvidenceState.NOT_RUN, evidence = '', metric = '') {
  return { id: cap.id, group: cap.group, label: cap.label, state, evidence, metric, source: cap.source };
}

export function summarizeResults(results) {
  const counts = Object.fromEntries(Object.values(EvidenceState).map((s) => [s, 0]));
  for (const item of results || []) if (counts[item.state] !== undefined) counts[item.state] += 1;
  const total = (results || []).length;
  const executed = total - counts[EvidenceState.NOT_RUN] - counts[EvidenceState.RUNNING];
  return { total, executed, counts, complete: executed === total };
}

export function summaryText(summary) {
  const c = summary.counts;
  return `已执行 ${summary.executed}/${summary.total} · 实证 ${c.verified} · 表面 ${c.surface} · 失败 ${c.failed}`;
}

export function sanitizeMetric(value, limit = 42) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

export function safeDeviceInfo(nav, screenLike) {
  return {
    online: typeof nav?.onLine === 'boolean' ? nav.onLine : null,
    language: typeof nav?.language === 'string' ? nav.language.slice(0, 16) : '',
    platform: typeof nav?.platform === 'string' ? nav.platform.slice(0, 20) : '',
    viewport: screenLike && Number.isFinite(screenLike.width) && Number.isFinite(screenLike.height)
      ? `${screenLike.width}×${screenLike.height}` : ''
  };
}

export function isSensitiveText(value) {
  return /(deviceId|serial|mac|token|password|latitude|longitude|rawValue)/i.test(String(value || ''));
}
