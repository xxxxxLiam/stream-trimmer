# Audit run 1 — live status

Generated 2026-11-21 18:58:18 UTC by `node audit/status.cjs`. Re-run it to refresh.

**4 of 8 area reports written.** 150 test scripts, 482 screenshots, 306 captured output files.

A helper writes its report last, so an area with no report is still running.

| Area | | Scripts | Shots | Captures | Last wrote | Report |
|---|---|--:|--:|--:|---|---|
| **A** | Onboarding and sign-in | 15 | 39 | 74 | 18m ago | done |
| **B** | Core clipping loop | 19 | 60 | 13 | 8s ago | running |
| **C** | Clip bank and campaigns | 19 | 58 | 38 | 23s ago | running |
| **D** | Output and editor handoff | 23 | 52 | 41 | 51s ago | done |
| **E** | Channel data and owner gate | 22 | 55 | 34 | 8m ago | done |
| **F** | Help, diagnostics and updates | 25 | 144 | 54 | 5s ago | running |
| **G** | Server and jobs | 11 | 0 | 25 | 10s ago | running |
| **H** | Accessibility and layout | 16 | 74 | 27 | 8m ago | done |

## Findings so far

Counted from the reports that exist. **Not yet verified** — under the
audit protocol a separate helper re-runs every blocker and major from
scratch, and false alarms are dropped before the action plan.

| Area | Blocker | Major | Minor | Polish |
|---|--:|--:|--:|--:|
| A — Onboarding and sign-in | 1 | 5 | 9 | 1 |
| D — Output and editor handoff | 3 | 7 | 13 | 2 |
| E — Channel data and owner gate | 3 | 5 | 6 | 1 |
| H — Accessibility and layout | 0 | 6 | 7 | 5 |
| **Total** | **7** | **23** | **35** | **9** |

## Where the evidence is

- Reports: `audit/run-1/areas/<AREA>.md`
- Test scripts: `audit/run-1/area-<X>/` — re-run one to reproduce a finding
- Screenshots and captured output: `audit/out/area-<X>/` (not in git; regenerated)
- The feature map and the limits of this environment: `audit/inventory.md`

