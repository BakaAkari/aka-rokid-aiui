# Monorepo conventions

`aka-rokid-aiui` is a monorepo for Rokid AIUI agents. This file documents the
conventions that keep it maintainable long-term.

## Agent isolation

- Each runnable agent lives in `agents/<name>/` and is **fully self-contained**:
  it owns its `package.json`, `AGENTS.md`, `app.json`, `app.js`, `app.wxss`,
  `lib/`, `pages/`, `test/`, `scripts/`, and `.aixignore`.
- **No cross-agent imports, no repo-root libs, no symlinks.** Anything an agent
  needs must live inside its own directory.
- This is what makes a single subdirectory import cleanly into AIUI Studio via
  "Import from Github → <subdirectory>".

## Agent boundaries

Each agent is an independent product/system boundary. Do not fold one agent's
responsibility into another:

- `connection-diagnostics` — local HTTPS / runtime connectivity probe.
- `system-diagnostics` — the **full device capability test system**: runtime base
  APIs, SpeechRecognition zh-CN, camera, speaker/synthesis, public HTTPS baseline.
  It is the **only** agent allowed to report device capability
  `ok / unsupported / failed`. Product name "系统测试".
- `combat-power-detector` — a **product prototype** of a camera/visual experience.
  It does **not** carry the full system diagnostics and never claims a real
  combat-power score.
- `hermes-agent` — a **development skeleton** for the future Hermes client. It is
  **not yet connected** to any Hermes endpoint and never claims real inference. It
  does not import or reuse the system test.

No agent imports another agent, and no agent reuses another agent's `lib/`. Each
is importable standalone into AIUI Studio.

## Always-apply rules

1. **No secrets.** No keys, tokens, passwords, or hardcoded private / tailnet IPs
   anywhere. Startup-facing endpoints are injected and gated to `https://`.
2. **No binary uploads.** Do not publish `.aix` packages nor push them here.
   Real packaging happens in AIUI Studio.
3. **Static `.aix` packaging.** AIUI Studio owns the `.aix` build via "Package
   AIX". Agent-local `scripts/package-aix.mjs` is a structural validator + safe
   local zip; it never emits a Studio binary and never uploads.
4. **Honest UI.** Diagnostics must never report a success the data did not prove.
   Prototypes are always labelled as prototypes on-screen.
5. **Version discipline.** `package.json` and each agent's `AGENTS.md` +
   `app.json`/page version must match. Bump only on explicit request.
6. **Every agent runs standalone.** `npm test`, `npm run validate`, and local
   packaging must work from inside the agent directory with no external deps.

## Glasses display constraints

Rokid Glasses1/2 are single-green monochrome `480×352`. Voice wakeup launches the
app; the only physical operation is the confirm key. There are no directional
menus, selectable tabs, or touch-driven multi-entry points. Agents must expose a
single confirm-driven action surface.

## Data policies

- Diagnostics never read response bodies (only HTTP status + latency).
- Camera / audio used only when a real permission is declared and granted.
- Nothing sensitive (device serial, `navigator.id`, transcripts, photo bytes) is
  written to the repo, committed, or echoed to logs.

## Validation

Root-level `scripts/` provide cross-agent checks:

- `validate` — structural sanity for every agent (app.json pages exist, Ink blocks
  are present, confirm-only UI, honest verdict wiring, no response-body reads, only
  `https://` endpoints).
- `check-secrets` — scans sources for key-like / token / private-IP literals.
- `check-versions` — ensures agent `package.json` ↔ `AGENTS.md` ↔ `app.json` /
  page `version` are in sync.

## CI

`.github/workflows/ci.yml` runs, on push and PR:

1. `npm ci` / install at the root.
2. `check-secrets` across the whole repo.
3. `check-versions` for every agent.
4. `npm test` at the root (which also runs each agent's tests).
5. Per-agent `npm run validate`.

Any secret, version drift, or validation failure fails the build.