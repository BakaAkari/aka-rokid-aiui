# aka-rokid-aiui

Long-term home for Rokid Glasses **AIUI agents**, structured as a monorepo so each
agent can be imported independently into [AIUI Studio](https://aiui-global.rokid.com/).
Currently it hosts glasses connection diagnostics, a camera-capability experiment
(prototype), and a clear lane for a future **Hermes** integration.

> This is a **source monorepo**. It intentionally contains **no binary `.aix`
> packages** and **no secrets**. Real `.aix` builds are produced by AIUI Studio's
> "Package AIX" step, not committed here. Nothing here is submitted to the Rokid
> Store or sent for review.

## Repository layout

```
.
├── agents/                          # self-contained, Studio-importable agents
│   ├── connection-diagnostics/      # confirm-key HTTPS / runtime connectivity probe
│   ├── system-diagnostics/          # FULL device capability test system (应用测试)
│   ├── combat-power-detector/       # camera/visual product prototype (PROTOTYPE)
│   └── hermes-agent/                # future Hermes client skeleton (未接入)
├── docs/                            # shared engineering + device-test docs
├── scripts/                         # root-level validate / secrets / version checks
├── test/                            # root-level shared (cross-agent) tests
└── .github/workflows/               # CI, version discipline, secrets scan
```

## What each agent is

| Agent | Purpose | Status |
| --- | --- | --- |
| `connection-diagnostics` | Single confirm-key flow: runtime self-check → public HTTPS baseline → phone Tailscale MagicDNS. Honest verdict (never claims a link passed unless MagicDNS was configured and every core step returned 2xx). | Maintained |
| `system-diagnostics` | **完整能力基线。** 单确认键执行 42 项 / 10 类 AIUI 应用层能力；按 `verified / surface / unsupported / unavailable / failed / not-run` 报告证据等级，并明确 CXR-S/Native 层边界。产品名“应用测试”。 | Maintained |
| `combat-power-detector` | **Product prototype** of a camera/visual experience. Named "战斗力检测器" but only proves camera availability / visual state — **no real human / identity / strength judgement** and **no** `ok/unsupported/failed` device-capability verdict (that belongs to `system-diagnostics`). | PROTOTYPE |
| `hermes-agent` | **Development skeleton** for the future Hermes client. It is **not yet connected** to any Hermes endpoint and never claims real inference; it only shows an honest "Hermes 尚未接入" status. | SKELETON (未接入) |

## Importing an agent into AIUI Studio

AIUI Studio supports importing a **specified directory** from GitHub. To import one
agent:

1. In AIUI Studio → create a project → **Import from Github**.
2. Point the repository to `BakaAkari/aka-rokid-aiui`, branch `main`.
3. Set the target directory to **`agents/connection-diagnostics`**, **`agents/system-diagnostics`**, **`agents/combat-power-detector`**, or **`agents/hermes-agent`**.
4. Studio resolves the project from that subdirectory — the agent must not require
   any file outside it. Each agent ships its own `app.json`, `app.js`, `AGENTS.md`,
   `README.md`, and `pages/index/index.ink`.

Alternatively **Import from local folder** pointing at `agents/<name>`.
For the full workflow (Craft, preview, real-device) see the
[official AIUI QuickStart](https://github.com/yodaos-project/AIUI/blob/main/documentation/0-guide/quickstart/quickstart.en-US.md).

## Real-device flow

1. Open the agent in AIUI Studio (import the subdirectory as above).
2. Use **Device Simulation → Preview** for web-based debugging (simulate wake-up,
   temple controls, and lighting).
3. **Build & Review → Package AIX** to produce a binary and sync it to the cloud.
4. In the **Hi Rokid** app → *Settings → Developer → Update glasses resource
   package*, wait for "Agent resource package downloaded successfully".
5. If the Studio project was deleted/recreated or package acquisition fails,
   fully restart the phone app to clear its cached Agent ID/package URL, then
   retry and verify the version displayed on the glasses.
6. Invoke via semantic matching, e.g. *"Hi Rokid, open <agent name>"*.

See `docs/device-test.md` for the per-agent verification matrix and honest-outcome
rules.

## Version discipline

- `package.json` and each agent's `AGENTS.md` + `app.json` / page `version` must
  stay in sync.
- Bump only on explicit request. CI (`check-versions`) enforces consistency and
  fails if they drift.

## Privacy & security

- **No secrets.** No keys, tokens, credentials, or hardcoded private / tailnet IPs.
  Endpoints are injected at launch and gated to `https://`.
- Diagnostics never read response bodies (only HTTP status + latency).
- Camera / audio are only used when a real permission (`CAMERA`,
  `RECORD_AUDIO`) is declared and granted.
- Sensitive device data (`navigator.id`, serial, transcripts, photo bytes) is never
  written to the repo, committed, or echoed to logs.
- CI (`check-secrets`) scans for key-like literals and fails on them.

## Roadmap

- **Hermes client**: a future agent (`agents/hermes-agent`) that integrates the
  Hermes protocol for on-glasses agentic inference. It is currently a **skeleton**
  and explicitly **not connected**. Kept out of `connection-diagnostics` (which
  does **not** integrate Hermes). It does not reuse the system test.
- **system-diagnostics** is the **full device capability test system**; it
  reports `ok / unsupported / failed` per capability. It is the only agent allowed
  to emit such a verdict.
- **combat-power-detector** is an explicit product prototype that only proves
  camera availability / visual state; real vision/judgement requires an offline or
  Hermes vision model and is **out of scope** for the prototype. Device-capability
  verdicts live only in `system-diagnostics`.

## License

Apache License 2.0. See the [official AIUI repo](https://github.com/yodaos-project/AIUI)
for the framework, docs, and skills.