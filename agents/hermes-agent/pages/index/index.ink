<script def>
{
  "navigationBarTitleText": "Hermes 客户端",
  "description": "Rokid Glasses Hermes 客户端（开发骨架）。语音唤起，唯一确认键。Hermes 尚未接入：不连接任何端点、不调用模型、不伪造可用性，只如实显示接入状态。",
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
  HermesStatus,
  HermesStatusLabels,
  Task,
  TaskLabels,
  evaluateHermesStatus,
  acceptTask,
  hermesUsable
} from '../../lib/status.js';

function nowClock() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default {
  data: {
    version: '0.1.0',
    clock: '--:--:--',
    statusText: HermesStatusLabels[HermesStatus.NOT_CONNECTED],
    statusClass: 'not_connected',
    detailText: '',
    usable: false,
    taskLabel: TaskLabels[Task.NONE]
  },

  onLoad() {
    this.clockTimer = null;
    this.refresh();
  },

  onShow() {
    this.updateClock();
    this.startClock();
  },

  onHide() {
    this.stopClock();
  },

  onUnload() {
    this.stopClock();
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
  // as confirm. The skeleton always reports "Hermes 尚未接入"; it never invents
  // a connection, an endpoint, or a model call.
  onKeyUp(event) {
    const code = event && event.code;
    if (code === 'Enter' || code === 'GlobalHook') {
      event.preventDefault();
      this.onConfirm();
    }
  },

  onConfirm() {
    this.refresh();
  },

  refresh() {
    const status = evaluateHermesStatus({ endpointInjected: false, authPresent: false });
    const task = acceptTask(Task.VIEW_STATUS);
    this.setData({
      statusText: HermesStatusLabels[status.status],
      statusClass: status.status,
      detailText: status.detail,
      usable: hermesUsable(),
      taskLabel: task.label
    });
  }
};
</script>

<page>
  <view class="screen">
    <view class="header-row">
      <text class="title">Hermes 客户端</text>
      <text class="header-meta">开发骨架 · v{{version}} · {{clock}}</text>
    </view>

    <view class="doc-tag">
      <text class="doc-text">SKELETON — Hermes 尚未接入，未连接任何端点</text>
    </view>

    <view class="status-block">
      <text class="verdict verdict-{{statusClass}}">{{statusText}}</text>
      <text class="verdict-detail" wx:if="{{detailText}}">{{detailText}}</text>
    </view>

    <view class="info">
      <text class="info-row">当前任务：{{taskLabel}}</text>
      <text class="info-row">能力可用：{{usable ? '是' : '否'}}</text>
    </view>

    <view class="hint-row">
      <text class="hint">确认：刷新状态</text>
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

.doc-tag {
  position: absolute;
  left: 16px;
  top: 38px;
  width: 448px;
  height: 14px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
}

.doc-text {
  font-size: 10px;
  color: rgba(64, 255, 94, 0.48);
}

.status-block {
  position: absolute;
  left: 16px;
  top: 62px;
  width: 448px;
  height: 52px;
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

.verdict-not_connected {
  color: rgba(64, 255, 94, 0.72);
}

.verdict-detail {
  font-size: 11px;
  color: rgba(64, 255, 94, 0.72);
}

.info {
  position: absolute;
  left: 16px;
  top: 128px;
  width: 448px;
  padding: 8px 12px;
  border: 1px solid rgba(64, 255, 94, 0.24);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  font-size: 13px;
  color: #40ff5e;
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