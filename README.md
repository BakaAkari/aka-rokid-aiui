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
│   └── combat-power-detector/       # camera capability detector (PROTOTYPE)
├── docs/                            # shared engineering + device-test docs
├── scripts/                         # root-level validate / secrets / version checks
├── test/                            # root-level shared (cross-agent) tests
└── .github/workflows/               # CI, version discipline, secrets scan
```

## What each agent is

| Agent | Purpose | Status |
| --- | --- | --- |
| `connection-diagnostics` | Single confirm-key flow: runtime self-check → public HTTPS baseline → phone Tailscale MagicDNS. Honest verdict (never claims a link passed unless MagicDNS was configured and every core step returned 2xx). | Maintained |
| `combat-power-detector` | Voice-wakeup app, single confirm key triggers **camera capability** detection + an honest placeholder. Named "战斗力检测器" but only reports camera availability / visual state — **no real human / identity / strength judgement**. | PROTOTYPE |

## Importing an agent into AIUI Studio

AIUI Studio supports importing a **specified directory** from GitHub. To import one
agent:

1. In AIUI Studio → create a project → **Import from Github**.
2. Point the repository to `BakaAkari/aka-rokid-aiui`, branch `main`.
3. Set the target directory to **`agents/connection-diagnostics`** (or
   `agents/combat-power-detector`).
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
5. Invoke via semantic matching, e.g. *"Hi Rokid, open <agent name>"*.

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

- **Hermes client**: a future agent that integrates the Hermes protocol for
  on-glasses agentic inference. Kept out of `connection-diagnostics` (which
  explicitly does **not** integrate Hermes) and parked as a new `agents/` entry.
- **combat-power-detector** is an explicit prototype that only proves camera
  availability; real vision/judgement requires an offline or Hermes vision model
  and is **out of scope** for the current prototype.

## License

Apache License 2.0. See the [official AIUI repo](https://github.com/yodaos-project/AIUI)
for the framework, docs, and skills.