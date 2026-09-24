import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HermesStatus,
  HermesStatusLabels,
  Task,
  TaskLabels,
  evaluateHermesStatus,
  acceptTask,
  hermesUsable
} from '../lib/status.js';

test('evaluateHermesStatus never claims a connection in this skeleton', () => {
  const r = evaluateHermesStatus({ endpointInjected: true, authPresent: true });
  assert.equal(r.status, HermesStatus.NOT_CONNECTED);
  assert.equal(r.ok, false);
  assert.match(r.detail, /尚未接入/);
});

test('hermesUsable is always false (skeleton is not yet integrated)', () => {
  assert.equal(hermesUsable(), false);
});

test('status labels are honest', () => {
  assert.equal(HermesStatusLabels[HermesStatus.NOT_CONNECTED], 'Hermes 尚未接入');
  assert.equal(HermesStatusLabels[HermesStatus.CONNECTED], 'Hermes 已接入');
  assert.equal(HermesStatusLabels[HermesStatus.CONFIGURED], 'Hermes 已配置');
});

test('acceptTask only allows the skeleton view-status task', () => {
  const v = acceptTask(Task.VIEW_STATUS);
  assert.equal(v.task, Task.VIEW_STATUS);
  assert.equal(v.label, TaskLabels[Task.VIEW_STATUS]);
  assert.match(v.detail, /尚未接入/);

  const none = acceptTask(Task.NONE);
  assert.equal(none.task, Task.NONE);
  assert.equal(none.label, TaskLabels[Task.NONE]);
  assert.equal(none.detail, '无任务');
});

test('task labels are present', () => {
  assert.equal(TaskLabels[Task.NONE], '无任务');
  assert.equal(TaskLabels[Task.VIEW_STATUS], '查看接入状态');
});