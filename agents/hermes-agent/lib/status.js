// Pure, runtime-independent logic for the Hermes Agent SKELETON.
//
// IMPORTANT: This is a long-term DEVELOPMENT SKELETON. It deliberately does NOT
// connect to any Hermes server, does NOT call any orphan/unverified endpoint, and
// does NOT pretend an on-glasses agentic inference is available. It only models
// the HONEST connection status so the UI can tell the user "Hermes 尚未接入".
//
// The Hermes client protocol is a FUTURE responsibility of this agent and is NOT
// implemented yet. Nothing in this module performs a network call, an auth, or a
// model inference. It is pure and unit-testable on the host with `node --test`.

export const HermesStatus = Object.freeze({
  NOT_CONNECTED: 'not_connected',   // Hermes is not integrated yet (always true in this skeleton)
  CONNECTED: 'connected',           // reserved for a future build; NEVER true here
  CONFIGURED: 'configured'          // reserved for a future build; NEVER true here
});

export const HermesStatusLabels = Object.freeze({
  [HermesStatus.NOT_CONNECTED]: 'Hermes 尚未接入',
  [HermesStatus.CONNECTED]: 'Hermes 已接入',
  [HermesStatus.CONFIGURED]: 'Hermes 已配置'
});

export const Task = Object.freeze({
  NONE: 'none',
  VIEW_STATUS: 'view_status'   // the only action in the skeleton: view status
});

export const TaskLabels = Object.freeze({
  [Task.NONE]: '无任务',
  [Task.VIEW_STATUS]: '查看接入状态'
});

/**
 * The honest connection status for this skeleton build.
 *
 * @param {object} input
 * @param {boolean} [input.endpointInjected] Whether a Hermes endpoint was
 *   injected at launch. In this skeleton it is always false — no real Hermes
 *   endpoint is wired, and none is claimed to be available.
 * @param {boolean} [input.authPresent] Whether credentials/auth were provided.
 * @returns {{status: string, ok: boolean, detail: string}}
 */
export function evaluateHermesStatus(input) {
  // The skeleton never claims to be connected or configured, regardless of any
  // injected input. This keeps 'Hermes 尚未接入' the only honest verdict.
  return {
    status: HermesStatus.NOT_CONNECTED,
    ok: false,
    detail: 'Hermes 客户端尚未接入，未连接任何端点'
  };
}

/**
 * The single honest closure action for the skeleton.
 *
 * @param {string} task  One of Task values.
 * @returns {{task: string, label: string, detail: string}}
 */
export function acceptTask(task) {
  if (task === Task.VIEW_STATUS) {
    return {
      task: Task.VIEW_STATUS,
      label: TaskLabels[Task.VIEW_STATUS],
      detail: '仅展示接入状态；Hermes 尚未接入'
    };
  }
  return { task: Task.NONE, label: TaskLabels[Task.NONE], detail: '无任务' };
}

/**
 * Whether any real Hermes capability is currently usable (always false in the
 * skeleton). The UI must render "尚未接入" and never a claim of real inference.
 *
 * @returns {boolean}
 */
export function hermesUsable() {
  return false;
}