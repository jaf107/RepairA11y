# RepairA11y — Research Plan and Implementation Handoff

## 1. The Research Claim

> For WCAG Success Criteria whose violations are dynamic (observable only at runtime), LLM-based repair systems that receive runtime evidence produce better patches than LLM-based repair systems that receive static evidence (HTML + screenshot).

## 2. Target Venue

- **Primary:** Universal Access in the Information Society (UAIS), Springer, Q1.
- **Secondary:** Empirical Software Engineering (EMSE), Springer, Q1.
- **Conference option:** ICSE / ASE / ASSETS.

## 3. Research Questions

- **RQ1 (Effectiveness):** Violation-elimination rate after patch application.
- **RQ2 (Runtime Evidence):** Does runtime evidence improve LLM repair over static evidence?
- **RQ3 (Verification Loop):** Does iterative detect-repair-verify improve quality over single-shot?
- **RQ4 (Regression):** Do patches introduce new violations or visual regressions?
- **RQ5 (Developer Utility):** Do engineers prefer generated patches over rule-based baselines? (N≈20)

## 4. System Architecture

### Stage 1 — Detection (NavA11y, unchanged)
Input: URL. Output: typed violation records in JSON.

### Stage 2 — Evidence Packaging
Evidence levels (experimental lever for RQ2):
- **E1:** outerHTML + full-page screenshot
- **E2:** E1 + WCAG technique text (F78, C27, G1, F44)
- **E3:** E2 + per-SC runtime evidence
- **E4:** E3 + annotated element-crop screenshot

Per-SC runtime evidence for E3:
- **2.4.3:** DOM order, tab sequence, visual reading order, divergence positions, positive tabindex values
- **2.4.7 / 2.4.13:** pre/post-focus computed-style snapshots (22 CSS properties), outline width px, contrast ratio, background color
- **2.4.11 / 2.4.12:** obscurer selector, bounding box, position value, z-index, obscuration ratio

### Stage 3 — Repair Generation
Typed patch output schema:
```json
{
  "patch_type": "css_inject" | "attr_set" | "dom_reorder" | "style_override",
  "target_selector": "string",
  "payload": {},
  "rationale": "string",
  "wcag_technique_cited": "F78" | "C27" | "G1" | "F44" | null
}
```

### Stage 4 — Patch Application
- Reversible patches
- Isolated-first, stacked-second testing
- Layout reflow pause before re-verification

### Stage 5 — Verification (detector-as-oracle)
1. Target resolution (re-run NavA11y)
2. Regression detection (new violations?)
3. Visual stability (SSIM / pixelmatch)

## 5. Datasets

- **D_d:** 22-page controlled dataset. Hand-author ground-truth patches for 14 true-positive violations.
- **D_r:** 26 Semrush top-site corpus. 2,947 violations. Stratified sample ~100.
- **D_new:** 50–100 hand-selected real-site cases with ground-truth patches.

## 6. Experimental Design

### RQ2 Evidence Ablation

| Condition | Evidence level |
|---|---|
| C1 | E1 (HTML only) |
| C2 | E1 + screenshot |
| C3 | E2 (+ WCAG technique) |
| C4 | E3 (+ runtime slice) |
| C5 | E4 (full) |

### Models
- **Current phase:** best free-tier model via OpenRouter (`https://openrouter.ai/models?max_price=0`)
- **Future PR:** Claude Sonnet/Opus, GPT-4o/4.1, paid DeepSeek

### Metrics
- Repair Resolution Rate, Patch Validity Rate, Regression Rate, Visual Stability, Iteration Count, Cost (tokens + USD), Human Preference

## 7. Timeline

- Month 1: NavA11y schema extension + evidence packager + D_d ground-truth patches
- Month 2: Rule-based generators for all 5 SCs — 100% resolution on D_d
- Month 3: LLM generator + typed patch schema + applier. Run C1–C4 on D_d.
- Month 4: Verification loop (C5) + regression detection. Prompt iteration.
- Month 5: Full D_r evaluation + D_new construction
- Month 6: RQ5 user study + statistical analysis
- Month 7–8: Journal write-up

## 8. Repo Layout

See directory structure in this repo. Key modules under `src/`.

## 9. First Milestones

1. Read NavA11y source. Identify Stage-2 evidence fields: already-captured-but-unexported vs. needs-new-instrumentation. Produce schema diff proposal.
2. Build detector wrapper (`src/detector/`).
3. Hand-author 3 ground-truth patches for D_d (one 2.4.13, one 2.4.11, one 2.4.3).
4. Rule-based generator for SC 2.4.13 only. Test on D_d.
5. Patch applier + verifier. Prove full loop 1→4→5 for one SC.
6. LLM generator for SC 2.4.13. Compare vs rule-based. Begin RQ2.

Only after milestone 6: add remaining four SCs.

## 10. Budget

**Current phase: $0.** Free tier via OpenRouter only.

## 11. Open Questions

- Patch target: CSS override at runtime (default) vs source-file patch (deferred)
- Scope: SC 2.4.13 first, then expand
- No agent framework (LangChain etc.) — plain orchestration

## 12. Related Work

- **AccessGuru (ASSETS 2025):** ~84% violation reduction, axe-core bounded, no focus-behavior SCs
- **Fernández-Navarro & Chicano (arXiv 2026):** Selenium + LLM, 80–86%, axe-bounded
- **DesignRepair (ICSE 2025):** Dual-stream, Material Design, not WCAG focus criteria
- **GenA11y (FSE 2025):** 0% recall on SC 2.4.3 and 2.4.7 — direct motivation for runtime evidence
- **RepairAgent (2024):** $0.14/bug — cost reporting methodology reference

One-sentence positioning:
> "Prior LLM-based accessibility repair inherits the coverage ceiling of static detectors. No existing system repairs WCAG focus-behavior violations. NavA11y closed the detection gap; RepairA11y closes the repair gap."

## 13. Threats to Validity

- Loop structure similar to AccessGuru re-prompting — frame contribution as runtime-grounded prompting, not the loop alone
- D_d dataset overlap — use D_r as primary
- LLM stochasticity — run 3× per experiment, temperature pinned, report mean ± std
- Patch overfitting to NavA11y oracle — report NavA11y pass rate AND manual review rate separately
