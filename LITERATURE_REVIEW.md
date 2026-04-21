# RepairA11y — Literature Review

Three claims need prior-work backing:
1. Accessibility repair is unsolved at scale
2. Focus-behavior violations are specifically unaddressed
3. Runtime evidence improves LLM repair over static evidence

---

## Cluster 1 — Web Accessibility Failures at Scale

**Justifies:** Introduction motivation. Why automated repair matters.

| Source | Key Finding | Cite For |
|--------|-------------|----------|
| WebAIM Million Report (2024) | 95.9% of home pages have detectable WCAG failures; avg 56.8 errors/page | Scale of problem — opening stat |
| Lazar et al., *Web Accessibility* (2015) | Manual auditing costs prohibitive for most organizations | Why automation is necessary |
| Seyfarth Shaw ADA Title III Report (annual) | 4,000+ web accessibility lawsuits/year in the US | Legal/compliance pressure angle |
| W3C WCAG 2.2 (Oct 2023) | SC 2.4.11, 2.4.12, 2.4.13 added; focus appearance requirements formalized | Recency — almost no tooling exists yet for these SCs |

**Critical stat:** WebAIM Million 2024 — "95.9% of sites fail" + "manual repair is infeasible at this scale" = entire motivation paragraph.

---

## Cluster 2 — Automated Accessibility Detection

**Justifies:** Why detection exists but repair is the open gap.

| Source | Key Finding | Cite For |
|--------|-------------|----------|
| axe-core (Deque Systems, 2015–present) | Static DOM analysis; covers ~55 WCAG SCs; most widely deployed | Dominant detector baseline; static-only |
| Vigo et al., W4A 2013 | Automated tools cover only 30–40% of WCAG violations | Inherent detection ceiling of static analysis |
| Alsaeedi & Joy, JSW 2020 | Survey of 26 accessibility tools — all static DOM/CSS analysis | No runtime tools existed pre-NavA11y |
| **NavA11y** (ENASE 2026) | First tool covering SC 2.4.7/2.4.11/2.4.12/2.4.13 at runtime via Playwright | Chapter 1 of thesis — foundation for RepairA11y |

**Argument chain:** Static detection tools miss focus-behavior violations → NavA11y solved detection at runtime → RepairA11y solves repair for the same violations.

---

## Cluster 3 — Automated Accessibility Repair (Direct Competitors)

**Justifies:** Novelty of RepairA11y. These are comparison baselines in evaluation.

| Paper | What It Does | Critical Gap | How RepairA11y Differs |
|-------|-------------|--------------|----------------------|
| **GenA11y** (FSE 2025) | LLM repair, axe-core violations, HTML + screenshot input | **0% recall on SC 2.4.3 and 2.4.7** — static evidence insufficient for runtime violations | Uses runtime evidence for exactly these SCs |
| **AccessGuru** (ASSETS 2025) | LLM + iterative re-prompting loop, ~84% violation reduction | axe-core bounded — no focus-behavior SCs covered at all | Targets SCs axe-core cannot detect |
| **DesignRepair** (ICSE 2025) | Dual-stream screenshot-based repair | Material Design targets, not WCAG; no focus behavior | WCAG-grounded, not design-system-specific |
| **Fernández-Navarro & Chicano** (arXiv 2026) | Selenium + LLM pipeline, 80–86% reduction on static + Angular SPAs | axe-core bounded, focus SCs absent, no evidence ablation | Runtime-grounded prompting; focus SCs in scope; RQ2 ablation |
| **ACCESS** (Huang et al., arXiv 2024) | Prompt engineering for web accessibility repair via foundation models; >51% violation reduction | Static HTML + DOM violation text only — no runtime state; no focus-behavior SCs | Runtime evidence; targets SCs ACCESS cannot even detect |
| **Iris** (Chen et al., ESEC/FSE 2023) | Context-aware CSS color/contrast repair for Android; 91.38% success, 9/40 PRs merged upstream | Android native UI, not web; contrast repair only — no focus-state transitions | Web-focused; captures focus-state CSS transition; SC 2.4.13 rule-based generator occupies same design space applied to web |
| **FixAlly** (Mehralian et al., arXiv 2024) | Multi-agent LLM: fix-strategy + code-localization + patch-generation agents; 69.4% developer acceptance | Mobile only (iOS/Android); static scanner output as evidence; no runtime capture | Web; single pipeline sufficient; runtime evidence replaces multi-agent decomposition |

**GenA11y is the primary motivation.** They proved static-only LLM repair fails on the exact violations targeted here. Quote their 0% recall number and SC scope directly — it is the single strongest justification for runtime evidence (RQ2).

**Iris (FSE 2023) is the nearest CSS-repair precedent.** Only existing work on automated CSS property-level repair; Android context shows design pattern is viable; web focus-indicator repair has no equivalent.

---

## Cluster 4 — LLM-Based Program Repair

**Justifies:** Why LLM is the correct approach for Stage 3 generator, not purely rule-based.

| Paper | Key Finding | Cite For |
|-------|-------------|----------|
| RepairAgent (Huang et al., 2024) | Autonomous LLM repair at $0.14/bug average cost | Cost/feasibility baseline for automated repair |
| ChatRepair (Xia & Zhang, ISSTA 2024) | Conversational LLM repair outperforms static APR tools | Iterative repair loop justification (RQ3) |
| Xia et al., LLM APR survey (2023) | LLMs outperform classical APR on diverse bug types | LLM > rule-based for complex, varied cases |
| Sobania et al. (arXiv 2023) | ChatGPT fixes 13/40 Defects4J bugs zero-shot | Zero-shot LLM repair capability established |
| Ahmed et al., Self-Consistency (arXiv 2023) | Sampling multiple LLM candidates + consistency voting improves patch quality | Justifies 3-trial methodology at pinned temperature (RQ2 reproducibility) |
| ScaleFix (Alotaibi et al., ICSME 2023) | Rule-based repair of Android touch-target size violations; 99% resolution rate | Establishes "rule-based repair for specific SC class" design pattern — directly supports SC 2.4.13 rule-based generator |

**Argument:** LLMs can repair code zero-shot when given sufficient context. Context quality determines success → motivates E1–E4 ablation (RQ2).

---

## Cluster 5 — Evidence and Context Quality in LLM Prompting

**Justifies:** RQ2 directly — runtime evidence is not just "more data," it is qualitatively different information.

| Paper | Key Finding | Cite For |
|-------|-------------|----------|
| Kang et al., fault localization + LLM repair (ICSE 2023) | Precise fault localization significantly increases LLM repair quality | Runtime evidence = better fault localization |
| Nashid et al., CEDAR (ICSE 2023) | Retrieval-augmented repair: correct context = better patches | Evidence quality → patch quality relationship |
| Feng et al., PromptAPR (2023) | Prompt design affects repair rate by 30–40% | Theoretical grounding for E1–E4 ablation |
| Pearce et al., security repair with LLMs (IEEE S&P 2023) | Domain-specific vulnerability context critical for correct fix | Runtime domain-specific context improves LLM |
| Cerovic et al., W4A 2025 | LLMs (Copilot, ChatGPT) introduce new accessibility violations when generating UI code — persistent ARIA misuse, missing focus management | Justifies Stage 5 verification; static LLM generation alone is insufficient |

**Argument:** Evidence quality is the independent variable in LLM repair quality. For dynamic violations, runtime evidence is the *correct* evidence — not a richer version of static, but a qualitatively different information class.

---

## Cluster 6 — Dynamic vs Static Analysis (Theoretical Basis)

**Justifies:** Why runtime evidence is fundamentally different from static evidence — not just "more context."

| Paper | Key Finding | Cite For |
|-------|-------------|----------|
| Ball, *The Concept of Dynamic Analysis* (TOPLAS 1999) | Dynamic analysis captures runtime behaviors unreachable by static analysis | Theoretical basis: static ≠ dynamic |
| Ernst et al., Daikon dynamic invariant detection (2007) | Runtime invariants reveal program properties static analysis cannot derive | Runtime data = different information class |
| Any CSS cascade specification (W3C) | Computed styles depend on cascade, inheritance, specificity, JS mutation — not recoverable from source HTML/CSS alone | Why outerHTML is insufficient for focus violations |

**Core argument:** Focus-behavior violations are CSS *computed-style* problems. The browser cascade + inheritance + JavaScript determine the final rendered style. No static analysis of source HTML/CSS can reconstruct this. Runtime evidence is not a bonus — it is the only valid evidence class for these violations. GenA11y's 0% recall empirically confirms this theoretical prediction.

---

## Narrative Thread (how clusters connect in the paper)

```
Cluster 1  →  Accessibility failures at scale demand automation
    ↓
Cluster 2  →  Detection tools exist but miss focus SCs (static ceiling)
              NavA11y (Ch. 1) fills detection gap at runtime
    ↓
Cluster 3  →  Repair tools exist but:
                GenA11y: 0% on focus SCs (static evidence fails empirically)
                Others: axe-core bounded, focus SCs absent entirely
              Repair gap remains open
    ↓
Clusters 4+5 → LLMs can repair code; context quality determines success
    ↓
Cluster 6  →  Runtime evidence is theoretically the correct evidence class
              for computed-style violations (not just "more context")
    ↓
RepairA11y →  First system to repair focus-behavior violations using
              runtime evidence — closes the gap GenA11y identified
```

---

## Key References to Obtain (Priority Order)

1. **GenA11y (FSE 2025)** — verify exact 0% recall claim and SC scope; this is your core motivation. PDF at seal.ics.uci.edu/publications/2025_FSE_GenA11y.pdf — check per-SC breakdown table directly
2. **WebAIM Million 2024** — free at webaim.org; cite specific percentages
3. **AccessGuru (ASSETS 2025)** — understand their loop structure (RQ3 comparison angle)
4. **WCAG 2.2 W3C spec (Oct 2023)** — cite for SC 2.4.11/2.4.12/2.4.13 recency
5. **NavA11y (ENASE 2026)** — your own Chapter 1; must cite as foundation
6. **ChatRepair (ISSTA 2024)** — loop iteration justification (RQ3)
7. **Kang et al. ICSE 2023** — fault localization → LLM quality link (RQ2 theory)
8. **Iris (ESEC/FSE 2023)** — nearest CSS-repair precedent; ACM DL 10.1145/3611643.3616329; cite as prior art for CSS property-level repair design
9. **ACCESS (Huang et al., arXiv:2401.16450)** — web accessibility repair via prompting, static DOM only; direct web competitor alongside GenA11y

---

## Threats Introduced by Literature Gaps

| Gap | Risk | Mitigation |
|----|------|-----------|
| AccessGuru loop structure similar to RQ3 | Reviewer: "this is just AccessGuru for a11y" | Frame as runtime-grounded prompting; AccessGuru has no runtime evidence; their loop re-prompts with static feedback only |
| GenA11y 0% claim unverified | Core motivation collapses if wrong | Read full paper (PDF confirmed accessible); check per-SC breakdown table; if claim is nuanced (e.g., 0% on subset), quote accurately and adjust framing |
| No existing work on CSS computed-style repair for web | Hard to compare | Frame as *advantage*: RepairA11y is first for web; Iris (FSE 2023) is nearest analog (Android, contrast only) — cite as design-pattern precedent, not direct competitor |
| ACCESS paper (arXiv 2024) overlaps with web repair framing | Reviewer: "this already exists" | ACCESS uses static DOM only, no runtime evidence, no focus-behavior SCs — the evidence gap is the differentiator, not the task framing |
| FixAlly multi-agent vs RepairA11y single pipeline | Reviewer: "simpler architecture = weaker" | Single pipeline is sufficient when evidence is richer; multi-agent decomposition compensates for poor evidence — runtime evidence eliminates the need |
