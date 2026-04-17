# RepairA11y

Automated repair system for WCAG 2.4 focus-behavior violations. Thesis chapter 2 follow-up to **NavA11y** (ENASE 2026).

## Sibling Dependency

RepairA11y depends on **NavA11y** as a sibling directory — not an npm dependency.

```
projects/
├── NavA11y/     ← detection engine + oracle (read-only from this repo)
└── RepairA11y/  ← this repo
```

NavA11y must be cloned at `../NavA11y/` relative to this repo root. Do not modify NavA11y source from here. Schema changes to NavA11y go through a separate PR against that repo.

## Research Claim

> For WCAG Success Criteria whose violations are dynamic (observable only at runtime), LLM-based repair systems that receive runtime evidence produce better patches than LLM-based repair systems that receive static evidence (HTML + screenshot).

## Target SCs

2.4.3 · 2.4.7 · 2.4.11 · 2.4.12 · 2.4.13

## Pipeline

```
Detection (NavA11y) → Evidence Packaging → Repair Generation → Patch Application → Verification (NavA11y)
```

## Setup

```bash
npm install
npx playwright install chromium
```

## Related Work

See `REPAIRA11Y_RESEARCH_PLAN.md` for full context, RQs, dataset descriptions, and related work.
