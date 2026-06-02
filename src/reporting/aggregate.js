/**
 * Aggregate per-case experiment results into machine-readable JSON and a
 * paper-ready Markdown report.
 *
 * Expected input: array of case objects:
 *   {
 *     caseId, sc, status, iterations,
 *     verify: { targetResolved, newFailureCount, similarity },
 *     patch: object|null, error?: string, evidenceLevel?: string,
 *     seed?: number, runIndex?: number, generator?: string
 *   }
 */

const STATUS_ORDER = ["RESOLVED", "UNRESOLVED", "REGRESSED", "DECLINED", "ERROR"];

export function aggregate(cases) {
  const total = cases.length;
  const byStatus = {};
  for (const s of STATUS_ORDER) byStatus[s] = 0;
  for (const c of cases) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;

  const resolved = byStatus.RESOLVED || 0;
  const regressed = (byStatus.REGRESSED || 0) +
    cases.filter((c) => c.verify?.newFailureCount > 0).length;
  const meanIterations = mean(cases.map((c) => c.iterations ?? 0));
  const meanSimilarity = meanDefined(
    cases.map((c) => c.verify?.similarity ?? c.verify?.ssim?.similarity ?? null),
  );

  return {
    total,
    resolved,
    resolutionRate: total ? resolved / total : 0,
    byStatus,
    regressionRate: total ? regressed / total : 0,
    meanIterations,
    meanSimilarity,
    bySC: groupedRates(cases, (c) => c.sc),
    byGenerator: groupedRates(cases, (c) => c.generator ?? "default"),
    byEvidenceLevel: groupedRates(cases, (c) => c.evidenceLevel ?? "n/a"),
  };
}

function groupedRates(cases, keyFn) {
  const groups = {};
  for (const c of cases) {
    const k = keyFn(c);
    if (!groups[k]) groups[k] = { total: 0, resolved: 0 };
    groups[k].total += 1;
    if (c.status === "RESOLVED") groups[k].resolved += 1;
  }
  for (const k of Object.keys(groups)) {
    const g = groups[k];
    g.rate = g.total ? g.resolved / g.total : 0;
  }
  return groups;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function meanDefined(arr) {
  const defined = arr.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!defined.length) return null;
  return mean(defined);
}

export function renderAggregateMarkdown(summary, opts = {}) {
  const { experiment = "experiment", timestamp = "" } = opts;
  const lines = [];
  lines.push(`# Experiment report — ${experiment}`);
  if (timestamp) lines.push(`_generated ${timestamp}_`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- **Cases**: ${summary.total}`);
  lines.push(
    `- **Resolution rate**: ${pct(summary.resolutionRate)} (${summary.resolved}/${summary.total})`,
  );
  lines.push(`- **Regression rate**: ${pct(summary.regressionRate)}`);
  lines.push(`- **Mean iterations**: ${summary.meanIterations.toFixed(2)}`);
  if (summary.meanSimilarity != null) {
    lines.push(`- **Mean SSIM**: ${summary.meanSimilarity.toFixed(3)}`);
  }
  lines.push("");
  lines.push("## By status");
  lines.push("| Status | Count |", "|---|---|");
  for (const s of STATUS_ORDER) lines.push(`| ${s} | ${summary.byStatus[s] ?? 0} |`);
  lines.push("");
  if (Object.keys(summary.bySC).length > 1) {
    lines.push("## By SC");
    lines.push("| SC | Resolved | Total | Rate |", "|---|---|---|---|");
    for (const [sc, g] of sortedEntries(summary.bySC)) {
      lines.push(`| ${sc} | ${g.resolved} | ${g.total} | ${pct(g.rate)} |`);
    }
    lines.push("");
  }
  if (Object.keys(summary.byGenerator).length > 1) {
    lines.push("## By generator");
    lines.push("| Generator | Resolved | Total | Rate |", "|---|---|---|---|");
    for (const [g, gr] of sortedEntries(summary.byGenerator)) {
      lines.push(`| ${g} | ${gr.resolved} | ${gr.total} | ${pct(gr.rate)} |`);
    }
    lines.push("");
  }
  if (Object.keys(summary.byEvidenceLevel).length > 1) {
    lines.push("## By evidence level");
    lines.push("| Level | Resolved | Total | Rate |", "|---|---|---|---|");
    for (const [lvl, g] of sortedEntries(summary.byEvidenceLevel)) {
      lines.push(`| ${lvl} | ${g.resolved} | ${g.total} | ${pct(g.rate)} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function sortedEntries(obj) {
  return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
}
