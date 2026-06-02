/**
 * Render a single repair attempt as a Markdown report block.
 *
 * @param {object} args
 * @param {object} args.violation       Normalized violation
 * @param {object|null} args.patch      Patch produced by generator (null if declined)
 * @param {object|null} args.verify     verify() result (null if not run)
 * @param {string} [args.status]        Loop status (RESOLVED / UNRESOLVED / DECLINED / ERROR)
 * @param {number} [args.iterations]    Number of loop iterations consumed
 * @returns {string}
 */
export function renderPerCaseMarkdown({
  violation,
  patch,
  verify,
  status,
  iterations,
}) {
  const lines = [];
  lines.push(`### ${violation.sc} — \`${violation.element?.selector ?? "(page-level)"}\``);
  lines.push(`- **violation id**: \`${violation.id ?? "(none)"}\``);
  lines.push(`- **status**: \`${status ?? "(unknown)"}\``);
  if (iterations != null) lines.push(`- **iterations**: ${iterations}`);
  if (violation.reason) lines.push(`- **reason**: ${violation.reason}`);
  if (verify) {
    lines.push(
      `- **resolved**: ${verify.targetResolved ? "yes" : "no"} · **new failures**: ${verify.newFailureCount ?? verify.newFailures?.length ?? 0} · **similarity**: ${(verify.similarity ?? verify.ssim?.similarity)?.toFixed?.(3) ?? "n/a"}`,
    );
  }
  if (patch) {
    lines.push("", "```json", JSON.stringify(patch, null, 2), "```");
  } else {
    lines.push("", "_no patch produced_");
  }
  return lines.join("\n");
}
