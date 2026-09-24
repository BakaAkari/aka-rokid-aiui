# Root AIUI monorepo

This is the root context file for agents working across the whole `aka-rokid-aiui`
repository. Each runnable AIUI agent lives in its own self-contained directory
under `agents/`, and carries its own `AGENTS.md`, `app.json`, `README.md`, tests,
validation, and `.aixignore`. **Never edit one agent by reaching into the files of
another**, and never import anything from outside an agent (no symlinks, no
repo-root libs) — each agent must be importable standalone into AIUI Studio.

## Layout

- `agents/<name>/` — a self-contained, AIUI-Studio-importable agent.
- `scripts/` — root-level validation / secrets / version checks.
- `test/` — root-level shared (cross-agent) tests.
- `docs/` — shared engineering + device-test docs.
- `.github/workflows/` — CI, version discipline, and secrets scans.

## Rules that always apply

1. **No secrets.** No keys, tokens, passwords, or hardcoded private/tailnet IPs in
   any source. Startup-facing endpoints must be injected and gated to `https://`.
2. **No binary uploads.** Do not publish `.aix` packages, nor push them to the repo
   or Rokid Store in this repo. Real packaging happens in AIUI Studio.
3. **Static `.aix` packaging.** AIUI Studio owns the `.aix` build via "Package
   AIX". Local `scripts/package-aix.mjs` is a structural validator + safe zip only;
   it never produces a Studio binary.
4. **Honest UI.** Diagnostics must never report a success that the data did not
   prove. Mark prototypes explicitly as prototypes.
5. **Version discipline.** `package.json` and each agent's `AGENTS.md` +
   `app.json`/page version must stay in sync. Bump only on explicit request.
6. **Every agent is standalone.** `npm test`, `npm run validate`, and local
   packaging must run from inside the agent directory with no external deps.

## Display constraints (glasses)

Rokid Glasses1/2 are single-green monochrome 480×352. Voice wakeup launches the
app; the only physical operation is the confirm key. No directional menus, no
selectable tabs, no touch-driven multi-entry points.

## Data policies

- Diagnostics never read response bodies (only HTTP status + latency).
- Camera/audio only used when a real permission is declared and granted.
- Nothing sensitive (device serial, `navigator.id`, transcripts, photo bytes) is
  written to the repo, committed, or echoed to logs.

See `docs/architecture.md` for the monorepo conventions and `docs/device-test.md`
for real-device verification steps.