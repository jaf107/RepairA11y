import { generateZIndexBump } from "./sc_2_4_11.js";

/**
 * Rule-based generator for SC 2.4.12 (Focus Not Obscured, Enhanced, AAA).
 *
 * Same shape as 2.4.11 but stricter — uses a larger safety buffer above the
 * obscurer's z-index since AAA tolerates zero overlap.
 */
export function generate({ violation }) {
  if (!violation || violation.sc !== "2.4.12" || violation.result !== "FAIL") {
    return null;
  }
  return generateZIndexBump(violation, { strict: true });
}
