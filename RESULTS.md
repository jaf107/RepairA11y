# RepairA11y — Results Summary (for supervisor review)

_Generated 2026-06-14. All runs this session: headless Chromium, retry/backoff enabled._

This document answers two questions: **(1) Can RepairA11y run over the whole
dataset?** and **(2) Does it fix everything NavA11y flags?** — and reports the
controlled-dataset effectiveness numbers, with honest caveats.

---

## TL;DR

1. **D_d (controlled, 10 cases) is the only valid effectiveness metric right now.**
   - Rule-based: **40% overall (4/10)** — **100% on SC 2.4.13 (4/4)**, 0% elsewhere.
   - LLM `gpt-oss-120b` (3 seeds): **13.3% (4/30)** — **66.7% on SC 2.4.12 (4/6)**, 0% elsewhere.
   - **Key finding: rule-based and LLM are _complementary_** — rule-based owns
     2.4.13, the LLM owns 2.4.12, with no overlap. This is the empirical case
     for the planned **hybrid generator**.

2. **D_r (27 live sites) is NOT yet evaluable for repair.** Detection works and
   finds thousands of focus-behavior FAILs, but the **repair/verify path for
   live sites is an unfinished stub** — 3107/3110 D_r cases error with
   _"must provide either url or htmlFile"_. The headline "0.1%" is an artifact of
   that stub, **not** a repair-quality measurement. Do not cite it.

3. **Free Gemma 4 is currently unusable**, not because it is weak but because the
   free OpenRouter endpoint is **upstream rate-limited (HTTP 429)** by Google AI
   Studio. Even with retry/backoff it errored on 6/8 real cases. `gpt-oss-120b`
   is the dependable free model today.

---

## 1. What was run

| Run | Corpus | Generator | Seeds | Result file |
|---|---|---|---|---|
| Rule-based baseline | D_d | rule | 1 (deterministic) | `experiments/rq1_effectiveness/results/run-2026-06-14T07-01-27-158Z.*` |
| LLM proper | D_d | `gpt-oss-120b` | 3 | `…run-2026-06-14T07-12-22-417Z.*` |
| LLM (rescue attempt) | D_d | `gemma-4-31b` | 1 | `…run-2026-06-14T07-14-27-653Z.*` |
| Live sweep | D_d + D_r | rule | 3 | `…run-2026-06-14T07-09-12-489Z.*` |

Environment notes:
- **Headless** Chromium for all detection/verification (see caveat §5.1).
- **Retry/backoff added** to the OpenRouter client this session so transient
  429s are retried instead of silently scored as failures
  ([client_openrouter.js](src/generators/llm_based/client_openrouter.js); 15/15 unit tests pass).

---

## 2. D_d effectiveness (the valid metric)

Per-SC resolution rate, controlled dataset, headless:

| SC | Rule-based | `gpt-oss-120b` (3 seeds) | `gemma-4-31b` (1 seed) |
|---|---|---|---|
| 2.4.7  | n/a¹ | 0/6 | 0/2 |
| 2.4.11 | 0/2 (0%) | 0/6 (0%) | 0/2 |
| 2.4.12 | 0/2 (0%) | **4/6 (66.7%)** | 1/2 (50%) |
| 2.4.13 | **4/4 (100%)** | 0/12 (0%) | 0/4 |
| **Overall** | **40% (4/10)** | **13.3% (4/30)** | 10% (1/10)² |

¹ Under headless, the two 2.4.7 fixtures return `NO_FAIL` (see §5.1) — nothing to repair.
² gemma still errored on 6/8 real cases due to upstream rate-limiting (§3).

Regression rate **0%** and mean SSIM **1.000** across all conditions — no patch
broke another check or visibly altered the page.

### The complementarity finding

```
Rule-based ──▶ 2.4.13  (100%)        gpt-oss ──▶ 2.4.12 (66.7%)
              └ misses 2.4.12                    └ misses 2.4.13
```

Neither generator alone exceeds 40%. A **hybrid** that routes by SC (rule-based
for 2.4.13, LLM for 2.4.12) would cover both — directly motivating the hybrid
design already on the roadmap. **2.4.11 remains unsolved by both** and is the
clearest open target.

---

## 3. Model comparison (free OpenRouter tier)

| Model | Modality | Works today? | Notes |
|---|---|---|---|
| `openai/gpt-oss-120b:free` | text | ✅ yes | Dependable; resolves 2.4.12; 6/30 cases errored (cause not logged) |
| `google/gemma-4-31b:free` | image+text+video | ❌ 429 rate-limited | "temporarily rate-limited upstream" by Google AI Studio |
| `google/gemma-4-26b-a4b:free` | image+text+video | ❌ 429 rate-limited | same |

**On the Gemma-vs-gpt-oss question:** Gemma's only task-relevant advantage is
**vision**, which matters _only_ for an **E4** (annotated-screenshot) arm of the
RQ2 ablation — at E1–E3 (text) it offers nothing over gpt-oss for this task. And
it currently won't run on the free tier. To use Gemma you would need your own
Google AI Studio (BYOK) key. **Recommendation: standardize on `gpt-oss-120b`;
revisit Gemma only if you add a vision-based E4 condition.**

---

## 4. D_r (live sites) — status

- **Detection works.** Across the 27 evaluable sites NavA11y flagged large
  numbers of focus-behavior FAILs (≈1842 for 2.4.13, 560 for 2.4.12, 390 for
  2.4.7, 325 for 2.4.11).
- **Repair is now implemented** (this session). The D_r branch previously passed
  `fixturePath: null` and errored on every case. It now captures each live page
  to a static post-hydration snapshot via `fetchPageToFile` and runs
  detect→repair→verify against that artifact, with each distinct FAIL targeted
  by selector ([rq1 run.js](experiments/rq1_effectiveness/run.js),
  [runner.js](experiments/_common/runner.js)). Verified end-to-end on a live
  site (genius.com: 2.4.13 → RESOLVED, SSIM 1.0).
- **Remaining limitation:** the offline-render probe
  ([scripts/probe-dr-results](scripts/probe-dr-results/)) showed many D_r sites
  are dynamic SPAs whose snapshots render imperfectly (SSIM 0.07–0.49); on those
  the snapshot detection may surface fewer or different FAILs than the live page.
  Sites that fail to load in 60 s (adp, nih) or return protocol errors
  (makemytrip) are recorded as ERROR. Full D_r numbers come from the run you
  launch per §8.

**Bottom line for Q2 ("does it fix everything flagged?"):** On D_d, it fixes the
SCs each generator covers (2.4.13 rule, 2.4.12 LLM) and nothing else. On D_r it
fixes ~nothing yet, because live-site repair is unimplemented.

---

## 5. Threats to validity / caveats

### 5.1 Headless changes the 2.4.7 oracle (new finding)
Both 2.4.7 fixtures (`outline:none`) detect as **2.4.7 = PASS** under headless
but **2.4.13 = FAIL**. Under headed Chromium (the prior default) they FAILed
2.4.7. So the headless switch **removes 2.4.7 from the evaluable set** on these
fixtures. Detection and verification both use headless here, so results are
_internally_ consistent — but 2.4.7 numbers are not comparable to earlier headed
runs, and the headless/headed choice must be fixed and disclosed.

### 5.2 Seed count
The valid LLM number is 3-seed (`gpt-oss`); gemma is 1-seed (and mostly errored).
Report `gpt-oss` as mean over 3 seeds; gemma is not yet reportable.

### 5.3 Free-tier reproducibility
Free endpoints rate-limit, may be deprecated before submission, and may log
prompts. Pin the exact model ID + access date; treat as a validity threat.

### 5.4 Oracle overfitting
All numbers above are the **NavA11y oracle** pass rate. The **manual-review
rate** must be reported separately — bundles for that are in §6.

### 5.5 Error logging gap
gpt-oss's 6 errored cases carry empty error messages — the runner should capture
`e.message` more robustly before these are used in the paper.

---

## 6. Artifacts for your validation

- **Manual-review bundles** (before/after HTML + full-page & focused screenshots
  + the patch + verify verdict; open the `REVIEW.md` in each):
  - `review-output/supervisor-2413-rule/` — rule-based fix of SC 2.4.13 (RESOLVED)
  - `review-output/supervisor-2412-llm/` — `gpt-oss-120b` fix of SC 2.4.12 (RESOLVED)
- **Machine-readable results:** the `*.json` files listed in §1.

---

## 7. Recommended next steps

1. **Decide headless vs headed** and standardize (affects whether 2.4.7 is in scope).
2. **Implement the D_r repair/verify path** — capture each live page to a
   verifiable artifact, then run the existing loop against it.
3. **Build the hybrid generator** (rule→2.4.13, LLM→2.4.12) — the data already
   justifies it.
4. **Attack 2.4.11** — unsolved by both generators.
5. **Run RQ2 evidence ablation** with `gpt-oss` now that the 429 bug is fixed;
   add a Gemma E4 arm only if you obtain a BYOK key.

---

## 8. Running the full matrix yourself

All 4 SCs × {rule, LLM} × {D_d, D_r}. Prerequisites are in place: retry/backoff,
request throttling (`OPENROUTER_MIN_INTERVAL_MS`), and the wired D_r repair path.

### Step 1 — enable headed detection (needed for 2.4.7)
Edit [nava11y/config/default.json](nava11y/config/default.json): set
`"browser": { "headless": false }`. **Chromium windows will appear** during the
run — that is required for 2.4.7 to register as a FAIL.

### Step 2 — set throttle + model (one-time, in `.env`)
Add these lines to `.env` (the API key is already there):
```
OPENROUTER_MODEL=openai/gpt-oss-120b:free
OPENROUTER_MIN_INTERVAL_MS=4000
```
`4000` ms ≈ 15 requests/min — keeps the LLM under the free-tier limit. Raise it
if you still see 429s in the logs; lower it to go faster at higher 429 risk.

### Step 3 — sanity check on D_d first (fast, ~30–60 min)
```bash
npm run run:rq1 -- --runs 3
```
Both generators, all 4 SCs, 3 seeds, controlled dataset only. Confirm the numbers
look right before committing to the long D_r run.

### Step 4 — full matrix incl. D_r (long: many hours)
Run it detached so it survives terminal closes, and tee the log:
```bash
nohup npm run run:rq1 -- --dr --runs 3 > rq1-full.log 2>&1 &
tail -f rq1-full.log        # watch progress; per-site FAIL counts are printed
```
> ⚠️ D_r has hundreds of FAILs/site; with the LLM generator + 4 s throttle this
> is a multi-hour run and some live sites will 429 or time out (logged as ERROR,
> they won't sink the run). Consider running overnight.

### Step 5 — read the results
Each run writes a timestamped pair to `experiments/rq1_effectiveness/results/`:
```bash
ls -t experiments/rq1_effectiveness/results/*.md | head -1 | xargs cat
```
The `.md` has the By-SC / By-generator tables; the `.json` has every case
(filter `corpus: "D_d"` vs `"D_r"`).

### Optional — restore headless when done
Set `nava11y/config/default.json` `headless` back to `true` to stop windows
appearing on future detection runs.

