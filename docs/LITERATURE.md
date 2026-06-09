# Literature Backing — RepairA11y Methodology

This document lists the published work that supports each methodological
decision in RepairA11y. Every paper here has been verified by direct lookup
(not memory). Use this as the bibliography spine for the thesis Chapter 2
methodology section.

---

## ⚠️ Corrections to my earlier informal claims

Two claims I made in prior conversation were wrong and need retraction before
they end up in any writeup:

1. **"GenA11y reports 0% recall on SC 2.4.3 and 2.4.7."** This is incorrect.
   GenA11y is a **detection** paper, not a repair paper, and it reports
   **94.5% precision, 87.6% recall** across 37 WCAG SCs (He, Huq, Malek, FSE
   2025). My earlier statement appears to have been a fabricated
   recollection. The chapter still has a legitimate gap to claim — but it has
   to be framed accurately. Use instead: "no published LLM accessibility
   repair system has performed evidence-level ablation on focus-behavior SCs"
   (verifiable from the four directly competing papers below).

2. **"DesignRepair (Liu et al., ICSE 2025)."** The lead author is Mingyue Yuan
   (CSIRO Data61), not Liu. Cite as Yuan et al., ICSE 2025.

---

## Direct competitors — WCAG-specific LLM repair systems

These are the closest published systems. The chapter's motivation rests on
the gaps in this group.

### Detection (the upstream signal)

- **GenA11y** — He, Huq, & Malek. *Enhancing Web Accessibility: Automated
  Detection of Issues with Generative AI.* Proceedings of the ACM on Software
  Engineering 2 (FSE 2025), pp. 2264–2287.
  [PDF](https://seal.ics.uci.edu/publications/2025_FSE_GenA11y.pdf)
  - GPT-4o, 37 WCAG success criteria, expert prompting + DOM-traversal
    context to depth 5.
  - **94.5% precision, 87.6% recall** on benchmark + 36 live sites.
  - **Detection only — no repair.** Confirms our detection chapter
    (NavA11y) sits in an active research line.

### Repair systems

- **AccessGuru** — Fathallah, Hernández, & Staab. *AccessGuru: Leveraging
  LLMs to Detect and Correct Web Accessibility Violations in HTML Code.*
  ASSETS 2025.
  [arXiv:2507.19549](https://arxiv.org/abs/2507.19549) ·
  [DBLP](https://dblp.org/rec/conf/assets/Fathallah0S25.html) ·
  [Code](https://github.com/NadeenAhmad/AccessGuruLLM)
  - **Up to 84% violation-score reduction.** Compared against contextual
    prompting (Othman et al. 2023), ReAct (Huang et al. 2024), and zero-shot
    (Delnevo et al. 2024) — all axe-bounded.
  - **Detector input: axe-Playwright + LLM semantic detector.**
  - Identifies persistently hard-to-correct violations:
    `page-has-heading-one`, `color-contrast`, `link-name`.
  - **No evidence-level ablation.** Single evidence model
    (HTML + violation summary). This is the gap RepairA11y's RQ2 fills.

- **Automated LLM-Based Accessibility Remediation** — Fernández-Navarro &
  Chicano (University of Málaga). *From Conventional Websites to Angular
  Single-Page Applications.* February 2026.
  [arXiv:2602.17887](https://arxiv.org/abs/2602.17887) ·
  [Replication package](https://doi.org/10.5281/zenodo.18693705)
  - **80% fix rate on 12 static sites; 86% on 6 Angular SPAs.**
  - Axe-core via Selenium + OpenAI API. WCAG 2.2 A and AA.
  - Differentiator they claim: works on dynamic SPAs.
  - **No evidence ablation; single evidence model.**

- **DesignRepair** — Yuan, Chen, Xing, Quigley, Luo, Luo, Mohammadi, Lu, &
  Zhu (CSIRO Data61). *Dual-Stream Design Guideline-Aware Frontend Repair
  with Large Language Models.* ICSE 2025.
  [arXiv:2411.01606](https://arxiv.org/abs/2411.01606) ·
  [Code](https://github.com/UGAIForge/DesignRepair)
  - **Dual-stream: source code + Playwright-rendered view.** RAG over
    Material Design 3 guidelines.
  - **92.9% recall / 90.1% precision on Vercel V0 projects; 87.8% / 93.5%
    on GitHub.**
  - **Closest visual-grounding cousin to our E4 level.**
  - Targets Material Design conformance, not WCAG conformance — different
    optimization target.

### Where these systems leave a gap

| Paper | Evidence to LLM | Runtime detector evidence used? | Per-level ablation? | Targets focus-behavior SCs? |
|---|---|---|---|---|
| GenA11y | HTML + DOM context | n/a (detection only) | n/a | partial (detection coverage includes focus-behavior; repair not addressed) |
| AccessGuru | HTML + axe summary | ❌ | ❌ | ❌ (axe-bounded) |
| Fernández-Navarro & Chicano | HTML + axe summary | ❌ | ❌ | ❌ (axe-bounded) |
| DesignRepair | source + Playwright view | partial (view rendering) | ❌ | ❌ (Material Design, not WCAG) |
| **RepairA11y** | E1–E4 graduated (HTML/text/runtime/visual) | ✅ (full NavA11y evidence) | ✅ (RQ2) | ✅ |

**This table is the cleanest justification for the chapter's existence.**

---

## Literature for graduated-evidence ablation methodology

The E1→E2→E3→E4 monotonic-additive ablation pattern is adapted from
RAG-ablation literature.

- **Lewis, Perez, Piktus, et al.** *Retrieval-Augmented Generation for
  Knowledge-Intensive NLP Tasks.* NeurIPS 2020.
  [arXiv:2005.11401](https://arxiv.org/abs/2005.11401)
  - Foundational RAG paper. Establishes that combining parametric (LLM
    weights) and non-parametric (retrieved evidence) memory measurably
    improves task accuracy. Cited 10,000+ times.
  - Use this citation in: methodology motivation for "why retrieve evidence
    at all."

- **Asai, Wu, Wang, Sil, & Hajishirzi.** *Self-RAG: Learning to Retrieve,
  Generate, and Critique through Self-Reflection.* ICLR 2024 (Oral, top 1%).
  [arXiv:2310.11511](https://arxiv.org/abs/2310.11511) ·
  [Project](https://selfrag.github.io/) ·
  [Code](https://github.com/akariasai/self-rag)
  - **Explicit retrieval ablation** with reflection tokens. Tests "No
    Retriever", "No Critic", "No retrieval" inference, "Hard constraints",
    "Retrieve top 1" — exactly the ablation shape we use.
  - Use this citation in: methodology for "ablation of retrieved evidence
    is established practice."

- **Cuconasu, Trappolini, Siciliano, et al.** *The Power of Noise:
  Redefining Retrieval for RAG Systems.* SIGIR 2024.
  [arXiv:2401.14887](https://arxiv.org/abs/2401.14887) ·
  [Code](https://github.com/florin-git/The-Power-of-Noise)
  - **Direct counter-evidence to "more relevant = better"**: high-scoring
    irrelevant documents hurt LLM accuracy; random documents can *help* by
    up to 35%.
  - Use this citation in: methodology defense against "isn't it obvious?"
    Specifically supports the framing that whether E3 > E1 is a genuine
    empirical question, not a foregone conclusion.

---

## Literature for "more context isn't always better" (the counter-evidence)

These four papers should be cited explicitly in the chapter's
threats-to-validity section to show we've engaged with the case that
runtime evidence might *not* help.

- **Liu, Lin, Hewitt, et al.** *Lost in the Middle: How Language Models Use
  Long Contexts.* Transactions of the Association for Computational
  Linguistics (TACL) 12 (2024), pp. 157–173.
  [DOI: 10.1162/tacl_a_00638](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00638/119630/) ·
  [arXiv:2307.03172](https://arxiv.org/abs/2307.03172) ·
  [Code](https://github.com/nelson-liu/lost-in-the-middle)
  - **U-shaped performance curve**: LLMs use evidence at the start and end
    of context well, but degrade significantly for middle-positioned
    information.
  - Use this in: justification for the prompt-block ordering (schema and
    rules at the *end* of every prompt, evidence in the middle is risky).
  - Implication for RepairA11y: even if E3's runtime slice is highly
    relevant, its placement matters. Worth checking that we put critical
    fields at block boundaries.

- **Shi, Chen, Misra, Scales, Dohan, Chi, Schärli, & Zhou.** *Large Language
  Models Can Be Easily Distracted by Irrelevant Context.* ICML 2023 (PMLR
  202:31210–31227).
  [arXiv:2302.00093](https://arxiv.org/abs/2302.00093) ·
  [GSM-IC benchmark](https://github.com/google-research-datasets/GSM-IC)
  - **Adding irrelevant sentences drops arithmetic-reasoning accuracy
    substantially.** Best macro accuracy across mitigations: 45%.
  - Mitigation: self-consistency improves micro accuracy by 11+ percentage
    points; CoT-0-shot benefits most (35.5 pp).
  - Use this in: justification for keeping our evidence
    SC-targeted (no generic WCAG context dumping) and for using temperature
    0 + JSON-mode (constrained decoding ≈ mild self-consistency).

- **Levy, Jacoby, & Goldberg.** *Same Task, More Tokens: the Impact of
  Input Length on the Reasoning Performance of Large Language Models.* ACL
  2024 (Long), pp. 15339–15353.
  [ACL Anthology](https://aclanthology.org/2024.acl-long.818/) ·
  [arXiv:2402.14848](https://arxiv.org/abs/2402.14848)
  - **Performance degrades well before maximum context length is reached**,
    in both padding types and even when added content is irrelevant.
    Perplexity does *not* predict reasoning performance on long inputs.
  - Use this in: bounding the size of evidence bundles. Specifically
    motivates the 600-character truncation of outerHTML in our base
    prompt (`base.js#truncate`).

---

## Literature for "static-analyzer-output → LLM-repair-input" pattern

This is the closest software-engineering precedent for our pipeline.

- **Jin, Shahriar, Tufano, et al. (Microsoft).** *InferFix: End-to-End
  Program Repair with LLMs over Retrieval-Augmented Prompts.* ESEC/FSE 2023.
  [DOI: 10.1145/3611643.3613892](https://dl.acm.org/doi/10.1145/3611643.3613892) ·
  [arXiv:2303.07263](https://arxiv.org/abs/2303.07263) ·
  [InferredBugs dataset](https://github.com/microsoft/InferredBugs)
  - **Infer static analyzer + 12B Codex generator + retrieval over similar
    fixes.** Pipeline shape almost identical to ours
    (NavA11y → evidence → LLM).
  - Top-1 accuracy: **65.6% C# / 76.8% Java.** Deployed at Microsoft.
  - Use this as the canonical precedent for "detector output is a valid
    repair input." Our adaptation to WCAG is novel; the pattern is not.

- **Xia & Zhang.** *Less Training, More Repairing Please: Revisiting
  Automated Program Repair via Zero-Shot Learning.* ESEC/FSE 2022.
  [PDF](http://lingming.cs.illinois.edu/publications/fse2022a.pdf) ·
  [DOI: 10.1145/3540250.3549101](https://dl.acm.org/doi/abs/10.1145/3540250.3549101) ·
  [arXiv:2207.08281](https://arxiv.org/html/2207.08281)
  - **AlphaRepair** — cloze-style zero-shot APR with pre-trained code
    models, no fine-tuning required. **3.3× more fixes than top baseline on
    Defects4J 2.0.**
  - Use this to justify our zero-shot LLM approach (no fine-tuning of the
    free-tier model). The literature shows zero-shot APR can be competitive.

---

## Citation map — which paper supports which design decision

| Methodology decision | Primary citation(s) | Quote / number to use |
|---|---|---|
| Detector → LLM repair pipeline | Jin et al. (ESEC/FSE 2023, InferFix) | "Infer static analyzer + LLM generator … 65.6%/76.8% top-1." |
| Graduated evidence ablation | Asai et al. (ICLR 2024, Self-RAG); Cuconasu et al. (SIGIR 2024) | "Self-RAG ablates No-Retriever, No-Critic, Hard-constraints, Top-1." |
| Counter-evidence — "more context can hurt" | Liu et al. (TACL 2024); Shi et al. (ICML 2023); Levy et al. (ACL 2024) | "U-shaped performance curve … significantly degrades when models must access relevant information in the middle." |
| Zero-shot LLM as repair generator | Xia & Zhang (FSE 2022) | "Cloze-style zero-shot APR ... 3.3× more fixes than top baseline." |
| RAG foundational justification | Lewis et al. (NeurIPS 2020) | "Combine pre-trained parametric and non-parametric memory … RAG outperformed parametric-only baselines on 3 open-domain QA tasks." |
| Why focus-behavior SCs are unaddressed | AccessGuru (Fathallah et al. ASSETS 2025); Fernández-Navarro & Chicano (2026) | "Axe-bounded; persistently hard violations include color-contrast, link-name." |
| Visual-grounding for repair | Yuan et al. (ICSE 2025, DesignRepair) | "Dual-stream LLM analysis with Playwright-rendered view … 92.9%/90.1% Vercel V0." |
| Detection of focus-behavior at runtime is feasible | He et al. (FSE 2025, GenA11y) | "94.5% precision, 87.6% recall across 37 WCAG SCs." |

---

## Honest framing for the chapter intro paragraph

> Recent work on LLM-based web accessibility repair (Fathallah et al.
> [ASSETS 2025]; Fernández-Navarro & Chicano [2026]; Yuan et al. [ICSE 2025])
> has demonstrated effective remediation on axe-bounded violation types,
> with reported violation-score reductions of up to 84% and fix rates up to
> 86% on real websites. However, none of these systems performs
> evidence-level ablation: each operates on a single, fixed evidence model
> (HTML + violation summary, optionally augmented with a screenshot), and
> none uses runtime detection evidence beyond what static accessibility
> testing engines produce. Consequently, the contribution of *runtime
> evidence* to LLM repair effectiveness is unmeasured. This chapter
> introduces a four-level monotonic-additive evidence taxonomy that isolates
> runtime evidence as the independent variable, building on the
> retrieval-ablation methodology of RAG literature (Asai et al. [ICLR 2024];
> Cuconasu et al. [SIGIR 2024]) and the static-analyzer-driven repair
> precedent of InferFix (Jin et al. [ESEC/FSE 2023]). We evaluate against
> documented counter-evidence that additional context can degrade LLM
> performance (Liu et al. [TACL 2024]; Shi et al. [ICML 2023]; Levy et al.
> [ACL 2024]) — making the question of whether runtime evidence improves
> accessibility repair a genuine empirical question rather than a foregone
> conclusion.

That paragraph cites 9 verified papers, all with direct hyperlinks, all
load-bearing for a specific claim. It is the right shape for a thesis
chapter introduction.

---

## What is *still* unsupported by the literature (the genuine novel claims)

The literature establishes everything *except* these three claims, which the
chapter must support on its own evidence:

1. **The E1/E2/E3/E4 taxonomy applied to WCAG repair.** Novel.
2. **Runtime detection signal specifically improving LLM accessibility
   repair on focus-behavior SCs.** Novel; this is RQ2.
3. **Detection-paired verification as the oracle for accessibility-repair
   evaluation.** Partially novel (the pattern is established in APR
   literature, but its application to accessibility is new).

These are the three contributions a reviewer should walk away with. The
literature gives us the *right to ask the question* and the *methodology
shape to ask it with*. The empirical answer is the chapter's job.
