# RepairA11y — Command Reference

## Prerequisites

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# NavA11y dependencies
cd nava11y && npm install && cd ..

# .env file must have:
# OPENROUTER_API_KEY=<your key>
```

---

## Detection (NavA11y)

Run NavA11y on a live URL:
```bash
node nava11y/run-check.js https://example.com
```

Run on a local HTML file:
```bash
node nava11y/run-check.js --file ./path/to/page.html
```

Output: `nava11y/reports/<sanitized-url>/results.json` + `index.html`

---

## D_r Detection Scan (all 27 production sites)

```bash
# Run full D_r detection scan
node --env-file=.env experiments/dr_detection_scan/run.js

# Results saved to:
# experiments/dr_detection_scan/results/scan-<timestamp>.json
```

---

## D_r Repair Scan (live URL repair + verify)

```bash
# Single site (real LLM)
node --env-file=.env experiments/dr_repair_scan/run.js --url https://www.stackoverflow.com

# Single site with evidence level
node --env-file=.env experiments/dr_repair_scan/run.js --url https://www.stackoverflow.com --level E3

# Multiple sites (limit N)
node --env-file=.env experiments/dr_repair_scan/run.js --limit 5

# All 25 eligible sites (SC 2.4.13)
node --env-file=.env experiments/dr_repair_scan/run.js --limit 25

# Dry run — no API calls, stub patch, sanity check
node --env-file=.env experiments/dr_repair_scan/run.js --dry --limit 1

# npm shortcut
npm run run:dr -- --limit 5
```

**Evidence levels:** E1 (HTML + screenshot) · E2 (+ WCAG text) · E3 (+ runtime styles) · E4 (+ annotated crop)

**Results:** `experiments/dr_repair_scan/results/run-<timestamp>.json`
**Screenshots:**
- Before: `nava11y/reports/<site>/2.4.13/fail_2_4_13_E*.png`
- After (RESOLVED): `nava11y/reports/<tmp-path>/resolved_showcase.png`

---

## D_d / D_new Experiments (controlled dataset)

```bash
# RQ1 — repair effectiveness on D_d
npm run run:rq1

# RQ2 — evidence level ablation (E1 vs E2 vs E3 vs E4)
npm run run:rq2

# RQ4 — regression analysis
npm run run:rq4

# Compile all results into summary table
node experiments/compile_results.js
```

---

## Individual URL Repair (one-shot)

```bash
# Repair a single URL and print result
npm run repair:url -- --url https://example.com --sc 2.4.13

# Validate a patch JSON file against schema
npm run validate:patch -- --file patch.json

# Manual review of results
npm run review
```

---

## Smoke Tests

```bash
# Detector smoke test
npm run smoke:detector

# E2E batch smoke tests
npm run smoke:batch1
npm run smoke:batch2
```

---

## Unit / Integration Tests

```bash
# All tests
npm test

# Fast tests (skip slow integration tests)
npm run test:fast

# Watch mode
npm run test:watch
```

---

## Viewing Results

```bash
# Pretty-print latest D_r repair run
node -e "
const fs = require('fs');
const dir = 'experiments/dr_repair_scan/results';
const f = fs.readdirSync(dir).filter(x=>x.endsWith('.json')).sort().reverse()[0];
const r = JSON.parse(fs.readFileSync(dir+'/'+f,'utf8'));
console.log('Summary:', r.summary);
r.results.forEach(s => console.log(s.status, s.url, 'ssim:', s.ssim?.similarity?.toFixed(3)));
"

# Open NavA11y HTML report in browser
open nava11y/reports/www_stackoverflow_com/index.html
```

---

## Common Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--url <url>` | Run on single URL only | all sites |
| `--level E1-E4` | Evidence level | E3 |
| `--limit N` | Max sites to process | 5 |
| `--dry` | Stub LLM, no API calls | false |

---

## Sites Blocked by Bot Detection

These D_r sites block headless Playwright (Cloudflare or similar):
- `nih.gov` — Cloudflare challenge page
- `adp.com` — intermittently blocked on second session

Workaround: none currently. Results for these sites will show real content in NavA11y baseline (NavA11y uses desktop UA) but RESOLVED showcase screenshot may show bot-detection page.
