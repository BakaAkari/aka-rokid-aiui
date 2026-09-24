# Real-device verification

Shared guidance for verifying an AIUI agent on Rokid Glasses. Per-agent matrices
live in each agent's own `docs/DEVICE_TEST.md`; this file covers the shared flow
and honest-outcome rules.

## Common prerequisites

- Device: domestic Rokid Glasses (YODAOS-Sprite), Rokid AI Android app.
- AIUI resource package synced successfully.
- The agent packaged through AIUI Studio **Build & Review → Package AIX** and
  synced (see `docs/architecture.md` or the agent README).

## Shared display & interaction checks

| Project | Expected |
| --- | --- |
| Layout | Fits a 480×352 single-green screen; title, status, body, one fixed action hint; no overlap. |
| No tabs/menu | No directional-key selection, no chips/tabs/multi-entry points. |
| Voice wakeup | Launch by voice (semantic match) shows the agent's title + "Confirm: start". |
| Confirm key is the only op | Start / stop / retry all driven by the confirm key; Enter & GlobalHook equal confirm. |
| Honest outcome | Never reports a success the data did not prove; prototypes are visibly labelled. |
| Back/exit cleanup | Releases in-flight probes, recognition, and media tracks before host exits. |

## Honest-outcome rules (all agents)

- A diagnostic **must not** report a link as passable unless every required step
  returned a measured 2xx (or an equivalent proof).
- Missing optional config (e.g. an unconfigured endpoint) yields **incomplete**,
  never a false success.
- Prototypes must be explicitly marked "原型 / PROTOTYPE" in the UI and in docs.
- Device capability `ok / unsupported / failed` may **only** be reported by
  `system-diagnostics`. `combat-power-detector` and `hermes-agent` must not emit
  such a verdict.
- A not-yet-integrated agent (e.g. `hermes-agent`) must honestly state it is not
  connected and must not claim real inference.

## Verification method checklist

1. Open the agent in AIUI Studio → **Device Simulation → Preview** for web
   debugging (simulate wake-up, temple controls, lighting).
2. After packaging, in the **Hi Rokid** app → *Settings → Developer → Update
   glasses resource package*, wait for "Agent resource package downloaded
   successfully".
3. Invoke by semantic match, e.g. *"Hi Rokid, open <agent name>"*.
4. Walk the agent-specific matrix in its `docs/DEVICE_TEST.md`.

## Privacy

- Do not capture `navigator.id`, serial numbers, MAC addresses, tokens, Hermes
  keys, or full transcripts in screenshots or logs.
- Agent-specific tests requiring camera/audio must have a declared permission and
  an explicit, granted state.