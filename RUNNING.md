# RUNNING — RepairA11y full-matrix run (fresh machine guide)

This is a self-contained guide to set up RepairA11y on a new PC and run the full
evaluation matrix: **all 4 SCs (2.4.7 / 2.4.11 / 2.4.12 / 2.4.13) × {rule-based,
LLM} × {D_d controlled, D_r live sites}**.

For the *interpretation* of results and known caveats, read [RESULTS.md](RESULTS.md).
This file is only about getting it running.

---

## 0. Prerequisites

| Need | Version | Check |
|---|---|---|
| Node.js | 20.x (18+ minimum) | `node -v` |
| npm | 10.x | `npm -v` |
| git | any | `git --version` |
| OpenRouter API key | free tier | https://openrouter.ai/keys |
| OS | macOS / Linux / Windows | headed Chromium needs a desktop session |

> **Headed Chromium:** detecting SC 2.4.7 requires a *visible* browser window
> (headless makes 2.4.7 falsely PASS — see RESULTS.md §5.1). So run on a machine
> with a real display, not a headless server. Windows will pop up during the run.

---

## 1. Get the code

```bash
git clone https://github.com/jaf107/RepairA11y.git
cd RepairA11y
git checkout full-matrix-runner    # the branch with the wired D_r path + throttle
```

(If `full-matrix-runner` has been merged to `main`, just stay on `main`.)

---

## 2. Install dependencies

```bash
# root project
npm install

# vendored NavA11y detector (separate install)
cd nava11y && npm install && cd ..

# Playwright browser binaries (BOTH installs above use Playwright; this downloads Chromium)
npx playwright install chromium
```

---

## 3. Configure `.env`

Copy the example and fill it in:

```bash
cp .env.example .env
```

Edit `.env` so it contains at least:

```
OPENROUTER_API_KEY=sk-or-v1-...your-key...
OPENROUTER_MODEL=openai/gpt-oss-120b:free
OPENROUTER_MIN_INTERVAL_MS=4000
```

- `OPENROUTER_MODEL` — `openai/gpt-oss-120b:free` is the dependable free model.
  (Gemma 4 free is upstream rate-limited and will mostly error — avoid unless you
  add your own Google AI Studio key.)
- `OPENROUTER_MIN_INTERVAL_MS=4000` — spaces LLM calls to ~15/min so the free tier
  doesn't 429. Raise to `6000`+ if you still see 429s in the log; lower to go
  faster at higher 429 risk. Transient 429s are retried automatically regardless.

`.env` is gitignored — your key never gets committed.

---

## 4. Headed vs headless

The committed config (`nava11y/config/default.json`) is **`"headless": false`**
= headed = **2.4.7 works out of the box** on a fresh clone. Nothing to change.

If you ever want to suppress the windows (and you accept losing 2.4.7), set
`"headless": true` in that file. Don't commit that change (it's a vendored file).

---

## 5. Verify the install (2 min, no API cost)

```bash
npm run test:fast          # should print: 120 passed
```

Optional single-case smoke (rule-based, one controlled fixture, headed):

```bash
npm run review -- nava11y/dataset/focus-behavior-dataset/tests/focus-appearance-outline-insufficient-contrast.html --generator rule --sc 2.4.13
```

It should end with `→ RESOLVED ssim=1.000` and write a bundle under `review-output/`.

---

## 6. Run the matrix

### 6a. D_d first — fast sanity (~30–60 min)

Controlled dataset, both generators, all 4 SCs, 3 seeds:

```bash
npm run run:rq1 -- --runs 3
```

Confirm the By-SC table looks sane before the long D_r run.

### 6b. Full matrix incl. D_r live sites (LONG — hours; run overnight)

```bash
# macOS / Linux: detached so it survives the terminal closing
nohup npm run run:rq1 -- --dr --runs 3 > rq1-full.log 2>&1 &
tail -f rq1-full.log          # watch progress (per-site FAIL counts are printed)
```

On Windows (PowerShell):

```powershell
npm run run:rq1 -- --dr --runs 3 *>&1 | Tee-Object rq1-full.log
```

> ⚠️ D_r has hundreds of FAILs per site. With the LLM generator + 4 s throttle
> this is a **multi-hour** run. Some live sites will 429 or time out (logged as
> ERROR — they will not crash the run). Keep the machine awake (disable sleep).

### Useful flags

| Flag | Effect |
|---|---|
| `--rule-only` | skip the LLM generator (free, fast) |
| `--llm-only` | skip rule-based |
| `--runs N` | LLM seeds for D_d (default 3) |
| `--sc 2.4.13` | restrict to one SC |
| `--dr` | also run the D_r live-site sweep |
| `--dry` | mock the LLM (wiring test, no API calls) |

---

## 7. Read the results

Each run writes a timestamped pair into `experiments/rq1_effectiveness/results/`:

```bash
# newest markdown report (By-SC / By-generator / By-status tables)
ls -t experiments/rq1_effectiveness/results/*.md | head -1 | xargs cat
```

The matching `.json` has every case. To split D_d vs D_r:

```bash
node -e "const r=require('./experiments/rq1_effectiveness/results/<FILE>.json'); \
const g=(c)=>c.reduce((a,x)=>{const k=x.corpus+'/'+x.sc+'/'+x.generator;a[k]=a[k]||{n:0,res:0};a[k].n++;if(x.status==='RESOLVED')a[k].res++;return a;},{}); \
console.table(g(r.all));"
```

> Note: result files and `review-output/` are gitignored (regenerated per run),
> so they won't appear in git — copy `rq1-full.log` / the `.md` report off the
> machine if you want to keep them.

---

## 8. Manual-review bundles (for human validation)

To produce before/after HTML + screenshots + the patch for any case:

```bash
npm run review -- <url-or-fixture-file> --generator <rule|llm> --sc <2.4.x> --out review-output/<name>
```

Open the generated `review-output/<name>/REVIEW.md` to inspect.

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| Lots of D_r `ERROR` with "Timeout 60000ms" | Live site too slow/blocked — expected for a few sites (adp, nih, makemytrip). Ignore. |
| Many LLM cases error with HTTP 429 | Raise `OPENROUTER_MIN_INTERVAL_MS` (e.g. 8000) and re-run. |
| `OPENROUTER_API_KEY not set` | Check `.env` exists and the key line has no quotes/spaces. |
| 2.4.7 shows only `NO_FAIL` | You're running headless — set `nava11y/config/default.json` `headless: false`. |
| `browserType.launch: Executable doesn't exist` | Run `npx playwright install chromium`. |
| Run dies when terminal closes | Use the `nohup … &` form in §6b. |

---

## 10. What "done" looks like

A completed run prints `[RQ1] overall: <rate>` and writes the `.md`/`.json` pair.
Take the `.md` By-SC table for D_d as your headline result; treat D_r as
best-effort on live sites (RESULTS.md §4). For the write-up, also report the
manual-review rate separately from the NavA11y pass rate (RESULTS.md §5.4).
