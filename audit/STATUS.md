# Audit run 1 — live status

Generated 2026-11-21 19:05:30 UTC by `node audit/status.cjs`. Re-run it to refresh.

**6 of 8 area reports written.** 162 test scripts, 513 screenshots, 343 captured output files.

A helper writes its report last, so an area with no report is still running.

| Area | | Scripts | Shots | Captures | Last wrote | Report |
|---|---|--:|--:|--:|---|---|
| **A** | Onboarding and sign-in | 15 | 39 | 74 | 25m ago | done |
| **B** | Core clipping loop | 23 | 77 | 19 | 7s ago | running |
| **C** | Clip bank and campaigns | 21 | 61 | 43 | 49s ago | done |
| **D** | Output and editor handoff | 23 | 52 | 41 | 8m ago | done |
| **E** | Channel data and owner gate | 22 | 55 | 34 | 15m ago | done |
| **F** | Help, diagnostics and updates | 26 | 155 | 60 | 6m ago | done |
| **G** | Server and jobs | 16 | 0 | 45 | 4s ago | running |
| **H** | Accessibility and layout | 16 | 74 | 27 | 16m ago | done |

## Findings so far

Counted from the reports that exist. **Not yet verified** — under the
audit protocol a separate helper re-runs every blocker and major from
scratch, and false alarms are dropped before the action plan.

| Area | Blocker | Major | Minor | Polish |
|---|--:|--:|--:|--:|
| A — Onboarding and sign-in | 1 | 5 | 9 | 1 |
| C — Clip bank and campaigns | 1 | 6 | 8 | 2 |
| D — Output and editor handoff | 3 | 7 | 13 | 2 |
| E — Channel data and owner gate | 3 | 5 | 6 | 1 |
| F — Help, diagnostics and updates | 2 | 8 | 9 | 1 |
| H — Accessibility and layout | 0 | 6 | 7 | 5 |
| **Total** | **10** | **37** | **52** | **12** |

## Where the evidence is

- Reports: `audit/run-1/areas/<AREA>.md`
- Test scripts: `audit/run-1/area-<X>/` — re-run one to reproduce a finding
- Screenshots and captured output: `audit/out/area-<X>/` (not in git; regenerated)
- The feature map and the limits of this environment: `audit/inventory.md`

