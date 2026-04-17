# Implementation Order

Strict sequence for tackling GitHub issues. Gated — do not skip ahead. Each step unlocks the next.

## Kickoff (new Claude Code session)

```bash
cd /Users/abujafar.saifullah/Documents/projects/RepairA11y
claude
```

First prompt:

> Read CLAUDE.md + REPAIRA11Y_RESEARCH_PLAN.md. Then `gh issue list --state open --limit 30`. Start on issue #5 (typed patch schema). Implement, open PR, close issue. Move to next per IMPLEMENTATION_ORDER.md.

## Per-issue kickoff template

```
Work issue #<N>. Read the issue body, CLAUDE.md section for context,
and any prior PRs. Make branch `issue-<N>-<slug>`, implement,
commit, push, open PR linking "Closes #<N>". Tests required before PR.
```

## Order

| Step | Issue | Title | Why this order |
|------|-------|-------|----------------|
| 1 | #5 | Typed patch schema + validator | Nothing types without it |
| 2 | #4 | Detector wrapper | Stage 1 input to everything |
| 3 | #6 | 3 ground-truth patches | Validates schema, seeds test oracle |
| 4 | #8 | Patch applier | Needed to test #6 patches |
| 5 | #9 | Verifier | Closes Stage 5 loop |
| 6 | #10 | Repair loop orchestration | Glues Stages 1→5 |
| 7 | #7 | Rule-based generator SC 2.4.13 | Milestone 3 gate — first real generator |
| 8 | #22 | Reporting modules | Needed before experiments |
| 9 | #11 | Evidence packager E1–E4 | Required for LLM + RQ2 |
| 10 | #12 | OpenRouter client | LLM infra |
| 11 | #13 | LLM generator SC 2.4.13 | Rule vs LLM comparison |
| 12 | #14 | RQ2 evidence ablation | Core research claim |
| 13 | #1 | NavA11y PR — style snapshots | Upstream — open early, merge before #14 final run |
| 14 | #2 | NavA11y PR — obscurer details | Merge before #16 |
| 15 | #3 | NavA11y PR — positive tabindex | Merge before #17 |
| 16 | #15 | Rule generator SC 2.4.7 | Milestone 6 start |
| 17 | #16 | Rule generator SC 2.4.11 + 2.4.12 | Depends on #2 merged upstream |
| 18 | #17 | Rule generator SC 2.4.3 | Depends on #3 merged upstream |
| 19 | #18 | RQ1 effectiveness experiment | Needs all generators |
| 20 | #19 | RQ3 loop iterations experiment | After RQ1 |
| 21 | #20 | RQ4 regression experiment | Reuses RQ1 patches |
| 22 | #23 | D_new release artifact | Writable anytime — park in background |
| 23 | #21 | RQ5 developer utility study | Last — needs finished patches |

## Parallel tracks

- **NavA11y PRs (#1, #2, #3)** — open early in a separate NavA11y session. Review cycle runs while RepairA11y side is built. Merge windows: #1 before step 12, #2 before step 17, #3 before step 18.
- **#23 D_new** — authorable anytime, no dependencies.

## Critical path to first paper-able result

Steps 1 → 12 (issues #5, #4, #6, #8, #9, #10, #7, #22, #11, #12, #13, #14).

Output: RQ2 evidence ablation on SC 2.4.13. Everything after is scaling + other RQs.
