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
3. If the Studio project was deleted/recreated, or the phone reports that the
   package could not be obtained, fully restart the Rokid AI app before retrying.
   Real-device verification confirmed that the phone may retain the deleted
   Agent ID/package URL until process restart. Do not diagnose this message as an
   AIX code crash unless the package was actually installed and launched.
4. Verify the version shown **on the glasses**, not only the Studio card or phone
   list. A successful build/download does not prove that the target version is
   active on-device.
5. Invoke by semantic match, e.g. *"Hi Rokid, open <agent name>"*.
6. Walk the agent-specific matrix in its `docs/DEVICE_TEST.md`; confirm every
   asynchronous step advances or reaches its bounded timeout. Reaching the target
   version alone is not a functional pass.

## Embedded-runtime lifecycle rule

- Permission and speech-recognition surfaces may temporarily trigger page
  `onHide`. `onHide` must pause presentation-only work such as the clock, but must
  not cancel or invalidate the active diagnostic run.
- Cleanup belongs to explicit stop/back, `onUnload`, or a proven terminal event.
- Speech, camera, and network calls require outer watchdogs so a vendor API that
  emits no terminal callback cannot block all later checks.

## Privacy

- Do not capture `navigator.id`, serial numbers, MAC addresses, tokens, Hermes
  keys, or full transcripts in screenshots or logs.
- Agent-specific tests requiring camera/audio must have a declared permission and
  an explicit, granted state.

## Complete capability baseline

`agents/system-diagnostics` 0.3.0 is the repository's development foundation. It
uses a fixed 33-item catalog across runtime, display/input, audio/AI, vision,
sensors, device information, connectivity, network, storage, and native-layer
boundaries. A result is never generalized to “all device abilities passed”:

- `verified`: real return, sample, or closed loop in this run;
- `surface`: API exists but the external loop was not proven;
- `unsupported`: runtime does not expose the documented API;
- `unavailable`: capability belongs to another layer or has no public AIUI API;
- `failed`: invocation, permission, sample, or timeout failed;
- `not-run`: requires an external device, sample, service, or controlled A/B run.