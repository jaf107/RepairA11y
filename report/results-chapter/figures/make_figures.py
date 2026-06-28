#!/usr/bin/env python3
"""Generate the figures for the Results chapter from the latest experiment JSON.

Run from anywhere:  python3 report/results-chapter/figures/make_figures.py
It globs the newest run-*.json in each experiment results dir, recomputes the
per-level / per-corpus / per-SC rates, and writes PNGs next to this script.
It also copies the before/after D_r screenshots that exist on disk.

Every number drawn here is recomputed from the JSON, not hard-coded, so the
charts always match the tables in results.md / results.tex.
"""
import glob
import json
import os
import shutil
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
FIGDIR = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(REPO, "experiments")

# Colour-blind-safe palette (Okabe-Ito subset).
C_RULE = "#0072B2"
C_LLM = "#D55E00"
LEVEL_COLORS = {"E1": "#999999", "E2": "#E69F00", "E3": "#009E73", "E4": "#56B4E9"}


def latest(pattern):
    files = sorted(glob.glob(pattern))
    return files[-1] if files else None


def load(path):
    with open(path) as fh:
        return json.load(fh)


def per_level_rates(rows):
    """resolved/total per evidence level over an array of trial rows."""
    agg = {}
    for r in rows:
        lvl = r.get("evidenceLevel") or "n/a"
        d = agg.setdefault(lvl, [0, 0])
        d[1] += 1
        if r.get("status") == "RESOLVED":
            d[0] += 1
    return {k: (v[0], v[1], 100.0 * v[0] / v[1] if v[1] else 0.0) for k, v in agg.items()}


def bar_levels(rates, title, outfile):
    levels = [l for l in ["E1", "E2", "E3", "E4"] if l in rates]
    vals = [rates[l][2] for l in levels]
    fig, ax = plt.subplots(figsize=(5.2, 3.4))
    bars = ax.bar(levels, vals, color=[LEVEL_COLORS.get(l, "#777") for l in levels])
    for b, l in zip(bars, levels):
        res, tot, pct = rates[l]
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 1.5,
                f"{pct:.1f}%\n({res}/{tot})", ha="center", va="bottom", fontsize=9)
    ax.set_ylabel("Resolution rate (%)")
    ax.set_ylim(0, 109)
    ax.set_xlabel("Evidence level")
    ax.set_title(title)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(outfile, dpi=150)
    plt.close(fig)
    print("wrote", outfile, {l: rates[l] for l in levels})


def fig_rq2():
    # Classify each run file by opts.dnew (the corpus row tag is absent in older
    # runs). For each corpus, keep the file with the most trials.
    dd = dnew = None
    for f in sorted(glob.glob(os.path.join(EXP, "rq2_evidence_ablation/results/run-*.json"))):
        d = load(f)
        rows = d.get("allResults") or []
        is_dnew = bool((d.get("opts") or {}).get("dnew"))
        cand = (f, rows)
        if is_dnew:
            if dnew is None or len(rows) > len(dnew[1]):
                dnew = cand
        else:
            if dd is None or len(rows) > len(dd[1]):
                dd = cand
    if dd:
        bar_levels(per_level_rates(dd[1]), "RQ2 evidence ablation — D_d (SC 2.4.13)",
                   os.path.join(FIGDIR, "rq2_ablation_dd.png"))
    if dnew:
        bar_levels(per_level_rates(dnew[1]), "RQ2 evidence ablation — D_new (SC 2.4.13)",
                   os.path.join(FIGDIR, "rq2_ablation_dnew.png"))


def fig_rq1():
    f = latest(os.path.join(EXP, "rq1_effectiveness/results/run-*.json"))
    if not f:
        return
    rows = load(f).get("all") or []
    agg = {}
    for r in rows:
        key = (r.get("corpus"), r.get("generator"))
        d = agg.setdefault(key, [0, 0])
        d[1] += 1
        if r.get("status") == "RESOLVED":
            d[0] += 1
    corpora = ["D_d", "D_new"]
    gens = ["rule_based", "llm_based"]
    fig, ax = plt.subplots(figsize=(5.6, 3.6))
    x = range(len(corpora))
    w = 0.36
    for gi, g in enumerate(gens):
        vals, labels = [], []
        for c in corpora:
            res, tot = agg.get((c, g), [0, 0])
            vals.append(100.0 * res / tot if tot else 0.0)
            labels.append(f"{res}/{tot}")
        bars = ax.bar([xi + (gi - 0.5) * w for xi in x], vals, w,
                      label="rule-based" if g == "rule_based" else "LLM (E3)",
                      color=C_RULE if g == "rule_based" else C_LLM)
        for b, lab in zip(bars, labels):
            ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 1.5, lab,
                    ha="center", va="bottom", fontsize=8)
    ax.set_xticks(list(x))
    ax.set_xticklabels(corpora)
    ax.set_ylabel("Resolution rate (%)")
    ax.set_ylim(0, 112)
    ax.set_title("RQ1 repair effectiveness by corpus and generator")
    ax.legend()
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    out = os.path.join(FIGDIR, "rq1_by_corpus.png")
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print("wrote", out, agg)


def fig_dr_detection():
    f = latest(os.path.join(EXP, "dr_detection_scan/results/scan-*.json"))
    if not f:
        return
    d = load(f)
    # Prefer the precomputed summary.bySc[sc].totalViolations; fall back to
    # summing per-site bySc counts (both recomputed from the same JSON).
    by_sc = {}
    summ = (d.get("summary") or {}).get("bySc") or {}
    for sc, v in summ.items():
        by_sc[sc] = int(v.get("totalViolations", 0)) if isinstance(v, dict) else int(v)
    if not by_sc:
        for s in d.get("results", []):
            for sc, n in (s.get("bySc") or {}).items():
                by_sc[sc] = by_sc.get(sc, 0) + (n or 0)
    order = ["2.4.7", "2.4.11", "2.4.12", "2.4.13"]
    scs = [s for s in order if s in by_sc] or list(by_sc.keys())
    vals = [by_sc[s] for s in scs]
    fig, ax = plt.subplots(figsize=(5.6, 3.4))
    bars = ax.bar(scs, vals, color="#882255")
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height(), str(v),
                ha="center", va="bottom", fontsize=9)
    ax.set_ylabel("Total violations detected")
    ax.set_xlabel("WCAG Success Criterion")
    ax.set_title("D_r violations by SC (production sites)")
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    out = os.path.join(FIGDIR, "dr_violations_by_sc.png")
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print("wrote", out, by_sc)


# The before/after example images (Figure 5.1) come from the recorded LLM patches
# and are produced by the sibling script make_dd_examples.mjs, not here.


if __name__ == "__main__":
    fig_rq2()
    fig_dr_detection()
    print("done")
