import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTranscript,
  buildProbeOutcome,
  buildProbePlan,
  CategoryLabels,
  classifyCapability,
  CapabilityState,
  describeProbeItem,
  evaluateDiagnostic,
  evaluateProbeRun,
  extractTranscript,
  is2xx,
  isHealthy,
  isHttpsUrl,
  NetworkStatus,
  nextRecogState,
  PhaseId,
  PhaseLabels,
  PhaseStatus,
  ProbeCategory,
  ProbeItemStatus,
  RecogState,
  RunVerdict,
  runtimeOkFromSummary,
  summarizeCapabilities,
  VerdictLabels,
  withTimeout
} from '../lib/probe.js';

test('capability distinguishes unsupported, failed and ok', () => {
  assert.equal(classifyCapability(false, null), CapabilityState.UNSUPPORTED);
  assert.equal(classifyCapability(true, new Error('denied')), CapabilityState.FAILED);
  assert.equal(classifyCapability(true, null), CapabilityState.OK);
  assert.deepEqual(summarizeCapabilities({ a: 'ok', b: 'unsupported', c: 'failed' }), { pass: 1, unsupported: 1, failed: 1, total: 3, allOk: false });
});

test('transcript interim becomes final without losing prior lines', () => {
  let state = { interim: '', committed: [] };
  state = applyTranscript(state, { text: '你好', type: 'interim' });
  assert.deepEqual(state, { interim: '你好', committed: [] });
  state = applyTranscript(state, { text: '你好', type: 'final' });
  assert.deepEqual(state, { interim: '', committed: ['你好'] });
  const finalResult = { 0: { transcript: '测试', confidence: 0.9 }, isFinal: true };
  assert.deepEqual(extractTranscript({ resultIndex: 0, results: [finalResult] }), { text: '测试', type: 'final', confidence: 0.9 });
});

test('recognition lifecycle returns to idle', () => {
  assert.equal(nextRecogState(RecogState.STARTING, 'start'), RecogState.LISTENING);
  assert.equal(nextRecogState(RecogState.LISTENING, 'stop'), RecogState.STOPPING);
  assert.equal(nextRecogState(RecogState.STOPPING, 'end'), RecogState.IDLE);
});

test('network outcome and timeout are bounded', async () => {
  const result = buildProbeOutcome({ status: NetworkStatus.OK, elapsedMs: 12, httpStatus: 200, ok: true, diagnostic: 'bounded' });
  assert.equal(result.statusText, 'OK');
  assert.equal(result.okText, '是');
  await assert.rejects(withTimeout(new Promise(() => {}), 5, 'probe'), /timed out/);
});

// --- Legacy network path diagnostic (kept for compatibility) ---------------

test('isHttpsUrl only accepts https://', () => {
  assert.ok(isHttpsUrl('https://example.com/'));
  assert.ok(isHttpsUrl('  HTTPS://EXAMPLE.COM '));
  assert.equal(isHttpsUrl('http://example.com/'), false);
  assert.equal(isHttpsUrl('ftp://example.com'), false);
  assert.equal(isHttpsUrl('100.64.0.1'), false);
  assert.equal(isHttpsUrl(''), false);
  assert.equal(isHttpsUrl(null), false);
  assert.equal(isHttpsUrl(undefined), false);
});

test('buildProbePlan orders baseline, magicdns, ip and skips non-https', () => {
  const plan = buildProbePlan({
    baseline: 'https://js.rokid.com/',
    magicdns: 'https://my-tailnet.ts.net/',
    ip: 'https://100.64.0.1/'
  });
  assert.deepEqual(plan.map((p) => p.category), [ProbeCategory.BASELINE, ProbeCategory.MAGICDNS, ProbeCategory.IP]);
  assert.equal(plan[0].url, 'https://js.rokid.com/');
  assert.equal(plan[1].label, CategoryLabels[ProbeCategory.MAGICDNS]);
  const filtered = buildProbePlan({ baseline: 'https://ok/', magicdns: 'http://nope/', ip: undefined });
  assert.deepEqual(filtered.map((p) => p.category), [ProbeCategory.BASELINE]);
  assert.deepEqual(buildProbePlan({}), []);
});

test('isHealthy requires a 2xx from a completed probe', () => {
  assert.ok(isHealthy(ProbeItemStatus.OK, 200));
  assert.ok(isHealthy(ProbeItemStatus.OK, 299));
  assert.equal(isHealthy(ProbeItemStatus.OK, 404), false);
  assert.equal(isHealthy(ProbeItemStatus.OK, 500), false);
  assert.equal(isHealthy(ProbeItemStatus.OK, null), false);
  assert.equal(isHealthy(ProbeItemStatus.ERROR, 200), false);
  assert.equal(isHealthy(ProbeItemStatus.TIMEOUT, null), false);
});

test('describeProbeItem renders a compact label for each outcome', () => {
  assert.equal(describeProbeItem({ status: ProbeItemStatus.OK, httpStatus: 200 }), 'HTTP 200');
  assert.equal(describeProbeItem({ status: ProbeItemStatus.TIMEOUT }), '超时');
  assert.equal(describeProbeItem({ status: ProbeItemStatus.ERROR, httpStatus: 404 }), 'HTTP 404');
  assert.equal(describeProbeItem({ status: ProbeItemStatus.ERROR }), '失败');
  assert.equal(describeProbeItem({ status: ProbeItemStatus.LOADING }), '探测中…');
});

test('evaluateProbeRun never passes when any endpoint is unhealthy', () => {
  const healthy = (category) => ({ category, label: category, status: ProbeItemStatus.OK, httpStatus: 200 });
  assert.equal(evaluateProbeRun([healthy(ProbeCategory.BASELINE), healthy(ProbeCategory.MAGICDNS)]).verdict, 'PASS');
  assert.equal(evaluateProbeRun([healthy(ProbeCategory.BASELINE), healthy(ProbeCategory.MAGICDNS), healthy(ProbeCategory.IP)]).pass, true);

  const run = evaluateProbeRun([
    healthy(ProbeCategory.BASELINE),
    { category: ProbeCategory.MAGICDNS, label: 'MagicDNS', status: ProbeItemStatus.TIMEOUT, httpStatus: null }
  ]);
  assert.equal(run.verdict, 'FAIL');
  assert.equal(run.pass, false);
  assert.equal(run.reachableCount, 1);

  const non2xx = evaluateProbeRun([
    healthy(ProbeCategory.BASELINE),
    { category: ProbeCategory.IP, label: 'IP', status: ProbeItemStatus.ERROR, httpStatus: 503 }
  ]);
  assert.equal(non2xx.verdict, 'FAIL');
});

test('evaluateProbeRun reports empty and incomplete runs honestly', () => {
  assert.equal(evaluateProbeRun([]).verdict, 'SKIP');
  assert.equal(evaluateProbeRun([{ status: ProbeItemStatus.LOADING }]).verdict, 'INCONCLUSIVE');
});

// --- Honest single-page diagnostic -----------------------------------------

test('is2xx matches only a 2xx HTTP code', () => {
  assert.ok(is2xx(200));
  assert.ok(is2xx(299));
  assert.equal(is2xx(404), false);
  assert.equal(is2xx(500), false);
  assert.equal(is2xx(null), false);
  assert.equal(is2xx('200'), false);
});

test('runtimeOkFromSummary requires allOk', () => {
  assert.equal(runtimeOkFromSummary({ allOk: true }), true);
  assert.equal(runtimeOkFromSummary({ allOk: false }), false);
  assert.equal(runtimeOkFromSummary(null), false);
  assert.equal(runtimeOkFromSummary({}), false);
});

const okStep = PhaseStatus.OK;
function diag(overrides) {
  return evaluateDiagnostic({
    runtimeOk: true,
    baselineStatus: okStep,
    baselineHttp: 200,
    magicdnsConfigured: true,
    magicdnsStatus: okStep,
    magicdnsHttp: 200,
    ...overrides
  });
}

test('evaluateDiagnostic passes only when ALL core steps are healthy', () => {
  // Configured + runtime ok + baseline ok + magicdns ok => PASS (链路通过).
  const pass = diag({});
  assert.equal(pass.verdict, RunVerdict.PASS);
  assert.equal(pass.passed, true);
  assert.equal(pass.detail, '链路通过');
});

test('evaluateDiagnostic never passes when MagicDNS is not configured', () => {
  // Even a perfect runtime + healthy public baseline must NOT pass; an
  // unconfigured MagicDNS means the tailnet path was not proven and the result
  // is INCOMPLETE (诊断未完成).
  const run = diag({ magicdnsConfigured: false });
  assert.equal(run.verdict, RunVerdict.INCOMPLETE);
  assert.equal(run.passed, false);
  assert.equal(run.detail, 'Tailscale 端点未配置 / 诊断未完成');
  assert.notEqual(run.verdict, RunVerdict.PASS);
});

test('evaluateDiagnostic fails when runtime self-check failed', () => {
  const run = diag({ runtimeOk: false });
  assert.equal(run.verdict, RunVerdict.FAIL);
  assert.equal(run.passed, false);
});

test('evaluateDiagnostic fails when baseline or magicdns is unhealthy', () => {
  const badBaseline = diag({ baselineStatus: PhaseStatus.FAIL, baselineHttp: null });
  assert.equal(badBaseline.verdict, RunVerdict.FAIL);

  const badMagic = diag({ magicdnsStatus: PhaseStatus.FAIL, magicdnsHttp: 503 });
  assert.equal(badMagic.verdict, RunVerdict.FAIL);

  const timeout = diag({ magicdnsStatus: PhaseStatus.FAIL, magicdnsHttp: null });
  assert.equal(timeout.verdict, RunVerdict.FAIL);
});

test('evaluateDiagnostic is independent of the optional Tailscale IP probe', () => {
  // The optional IP probe (whose public cert may not cover an IP literal) must
  // never change the main verdict: PASS stays PASS even if the IP probe failed.
  const stillPass = evaluateDiagnostic({
    runtimeOk: true,
    baselineStatus: PhaseStatus.OK,
    baselineHttp: 200,
    magicdnsConfigured: true,
    magicdnsStatus: PhaseStatus.OK,
    magicdnsHttp: 200
    // ipStatus deliberately absent — not an input to the verdict.
  });
  assert.equal(stillPass.verdict, RunVerdict.PASS);
});

test('phase and verdict labels are present and honest', () => {
  assert.equal(PhaseLabels[PhaseId.RUNTIME], '运行环境');
  assert.equal(PhaseLabels[PhaseId.BASELINE], '公网');
  assert.equal(PhaseLabels[PhaseId.MAGICDNS], '手机Tailscale');
  assert.equal(VerdictLabels[RunVerdict.INCOMPLETE], '诊断未完成');
  assert.equal(VerdictLabels[RunVerdict.PASS], '链路通过');
});