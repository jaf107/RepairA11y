import fs from "fs";
import path from "path";

const REPORT_DIR = path.join(process.cwd(), "reports");
let currentSanitizedUrl = "unknown-site";

function initReport(url) {
  // Sanitize URL for folder name: replace non-alphanumeric with _
  currentSanitizedUrl = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase();

  const dir = path.join(REPORT_DIR, currentSanitizedUrl);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function captureFailure(
  page,
  selector,
  issueText,
  filenameBase,
  scId = "general",
) {
  const reportDir = getReportDir();
  const failureDir = path.join(reportDir, scId);
  if (!fs.existsSync(failureDir)) fs.mkdirSync(failureDir, { recursive: true });

  // Ensure absolute cleanliness before injecting anything
  await page.evaluate(() => {
    const existingBadges = document.querySelectorAll(".__dynamic_a11y_badge");
    existingBadges.forEach((b) => b.remove());

    document.querySelectorAll("[data-dynamic-a11y-outline]").forEach((e) => {
      e.style.outline = e.getAttribute("data-dynamic-a11y-outline") || "";
      e.removeAttribute("data-dynamic-a11y-outline");
    });
  });

  await page.evaluate(
    ({ sel, msg }) => {
      const el = document.querySelector(sel);
      if (!el) return;

      const originalOutline = el.style.outline || "";
      el.setAttribute("data-dynamic-a11y-outline", originalOutline);

      el.style.outline = "4px solid #ff0000";
      el.style.outlineOffset = "8px";

      const badge = document.createElement("div");
      badge.innerText = msg;
      badge.className = "__dynamic_a11y_badge";
      Object.assign(badge.style, {
        position: "absolute",
        zIndex: "2147483647",
        background: "#d32f2f",
        color: "white",
        padding: "4px 8px",
        fontSize: "12px",
        fontWeight: "bold",
        borderRadius: "4px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      });

      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      const left = r.left + window.scrollX;

      badge.style.top = `${Math.max(0, top - 30)}px`;
      badge.style.left = `${Math.max(0, left)}px`;
      document.body.appendChild(badge);
    },
    { sel: selector, msg: issueText },
  );

  const filename = `${filenameBase}.png`;
  const filePath = path.join(failureDir, filename);

  await page.screenshot({ path: filePath, fullPage: false });

  await page.evaluate(() => {
    document
      .querySelectorAll(".__dynamic_a11y_badge")
      .forEach((b) => b.remove());
    document.querySelectorAll("[data-dynamic-a11y-outline]").forEach((e) => {
      e.style.outline = e.getAttribute("data-dynamic-a11y-outline") || "";
      e.removeAttribute("data-dynamic-a11y-outline");
    });
  });

  return `${scId}/${filename}`; // Relative to report dir
}

function getReportDir() {
  if (!currentSanitizedUrl) throw new Error("Report not initialized");
  const dir = path.join(REPORT_DIR, currentSanitizedUrl);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function generateHtmlReport(results) {
  const timestamp = new Date().toLocaleString();
  const reportDir = getReportDir();

  // Separate page-level from element-level results
  const pageLevelResults = results.filter((r) => r.checkType === "page-level");
  const elementLevelResults = results.filter(
    (r) => r.checkType === "element-level",
  );

  // Group results by criterion dynamically
  const criteriaMap = new Map();
  results.forEach((r) => {
    if (!r.sc) return;
    if (!criteriaMap.has(r.sc)) {
      criteriaMap.set(r.sc, { all: [], failures: [], passes: [], reviews: [] });
    }
    const criterion = criteriaMap.get(r.sc);
    criterion.all.push(r);
    if (r.result === "FAIL") criterion.failures.push(r);
    else if (r.result === "PASS") criterion.passes.push(r);
    else if (r.result === "REVIEW") criterion.reviews.push(r);
  });

  // Get unique elements count (only from element-level results)
  const uniqueElements =
    elementLevelResults.length > 0
      ? [
          ...new Set(
            elementLevelResults.map((r) => r.element?.selector).filter(Boolean),
          ),
        ].length
      : 0;

  // Build stats HTML dynamically
  const statsHTML = Array.from(criteriaMap.entries())
    .map(
      ([sc, data]) => `
    <div class="stat ${data.failures.length === 0 ? "stat-pass" : "stat-fail"}">
        <div class="stat-val">${data.failures.length}</div>
        <div>${sc} Failures</div>
    </div>
    <div class="stat">
        <div class="stat-val">${data.passes.length}</div>
        <div>${sc} Passed</div>
    </div>
  `,
    )
    .join("");

  // Build filter buttons dynamically
  const filterButtonsHTML = [
    '<button class="filter-btn active" onclick="filterCriterion(\'all\')">Show All</button>',
    ...Array.from(criteriaMap.keys()).map(
      (sc) =>
        `<button class="filter-btn" onclick="filterCriterion('${sc}')">${sc} Only</button>`,
    ),
    '<button class="filter-btn" onclick="filterCriterion(\'fail\')">Failures Only</button>',
  ].join("");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Accessibility Report - ${currentSanitizedUrl}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; max-width: 1400px; margin: 0 auto; }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
    h2 { margin-top: 30px; color: #333; }
    .stat-box { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
    .stat { background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; min-width: 120px; }
    .stat-val { font-size: 24px; font-weight: bold; }
    .stat-fail .stat-val { color: #d32f2f; }
    .stat-pass .stat-val { color: #388e3c; }
    .section { margin-top: 30px; padding: 20px; background: #fafafa; border-radius: 8px; }
    .criterion-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 8px; }
    .badge-247 { background: #1976d2; color: white; }
    .badge-2413 { background: #7b1fa2; color: white; }
    .badge-243 { background: #388e3c; color: white; }
    .badge-page { background: #ff6f00; color: white; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; border-bottom: 1px solid #ddd; text-align: left; }
    th { background: #f9f9f9; font-weight: 600; }
    .fail { color: #d32f2f; font-weight: bold; }
    .pass { color: #388e3c; font-weight: bold; }
    .review { color: #f57c00; font-weight: bold; }
    .screenshot-thumb { max-width: 200px; max-height: 150px; border: 1px solid #ddd; border-radius: 4px; }
    details { margin-top: 5px; cursor: pointer; color: #555; }
    .filter-buttons { margin: 20px 0; }
    .filter-btn { padding: 8px 16px; margin-right: 10px; border: 2px solid #ddd; background: white; border-radius: 4px; cursor: pointer; }
    .filter-btn.active { background: #1976d2; color: white; border-color: #1976d2; }
  </style>
  <script>
    function filterCriterion(sc) {
      const rows = document.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const criterion = row.dataset.sc;
        const result = row.dataset.result;
        if (sc === 'all') {
          row.style.display = '';
        } else if (sc === 'fail') {
          row.style.display = result === 'FAIL' ? '' : 'none';
        } else {
          row.style.display = criterion === sc ? '' : 'none';
        }
      });

      // Update active button
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      event.target.classList.add('active');
    }
  </script>
</head>
<body>
  <h1>Accessibility Report: ${currentSanitizedUrl}</h1>
  <p>Generated: ${timestamp}</p>
  <p><strong>${uniqueElements}</strong> elements tested | <strong>${criteriaMap.size}</strong> WCAG criteria</p>

  ${
    pageLevelResults.length > 0
      ? `
  <div class="section">
    <h2>Page-Level Checks</h2>
    ${pageLevelResults
      .map((r) => {
        const violations = r.violations || [];
        if (
          (r.result === "FAIL" || r.result === "REVIEW") &&
          violations.length > 0
        ) {
          // Build a flat list of per-violation rows mirroring the element-level table
          const rows = [];
          // Map violation screenshots by selector for quick lookup
          const shotMap = {};
          if (Array.isArray(r.violationScreenshots)) {
            for (const vs of r.violationScreenshots) {
              if (!shotMap[vs.selector]) shotMap[vs.selector] = vs.screenshot;
            }
          }

          for (const v of violations) {
            if (v.type === "positive-tabindex" && Array.isArray(v.elements)) {
              for (const el of v.elements) {
                rows.push({
                  selector: el.selector,
                  reason: `tabindex=${el.tabIndex} — ${v.reason}`,
                  screenshot: shotMap[el.selector] || null,
                  evidence: el,
                });
              }
            } else if (v.type === "focus-trap" && Array.isArray(v.elements)) {
              for (const sel of v.elements) {
                rows.push({
                  selector: sel,
                  reason: v.reason,
                  screenshot: shotMap[sel] || null,
                  evidence: v,
                });
              }
            } else if (
              v.type === "visual-order-mismatch" &&
              Array.isArray(v.mismatches) &&
              v.mismatches.length > 0
            ) {
              for (const m of v.mismatches) {
                rows.push({
                  selector: m.selector || "(multiple)",
                  reason: v.reason,
                  screenshot: m.selector ? shotMap[m.selector] || null : null,
                  evidence: m,
                });
              }
            } else {
              // Generic row for violation types without per-element selectors
              rows.push({
                selector: "(page-level)",
                reason: v.reason,
                screenshot: r.screenshot || null,
                evidence: v,
              });
            }
          }

          return `
          <div style="margin-bottom: 20px;">
            <h3>
              <span class="criterion-badge badge-page">${r.sc}</span>
              <span class="${r.result.toLowerCase()}">${r.result}</span>
              &mdash; ${escapeHtml(r.reason)}
            </h3>
            <table>
              <thead>
                <tr>
                  <th>Selector / Location</th>
                  <th>Issue</th>
                  <th>Screenshot</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `
                <tr data-sc="${r.sc}" data-result="${r.result}">
                  <td><code>${escapeHtml(row.selector)}</code></td>
                  <td>${escapeHtml(row.reason)}</td>
                  <td>${row.screenshot ? `<a href="${row.screenshot}" target="_blank"><img src="${row.screenshot}" class="screenshot-thumb" alt="Screenshot"></a>` : "N/A"}</td>
                  <td>
                    <details>
                      <summary>Evidence</summary>
                      <pre>${escapeHtml(JSON.stringify(row.evidence, null, 2))}</pre>
                    </details>
                  </td>
                </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
        }

        // PASS or REVIEW with no violations — brief summary
        return `
        <div style="margin-bottom: 20px;">
          <h3>
            <span class="criterion-badge badge-page">${r.sc}</span>
            <span class="${r.result.toLowerCase()}">${r.result}</span>
          </h3>
          <p><strong>Reason:</strong> ${escapeHtml(r.reason)}</p>
          ${r.screenshot ? `<p><a href="${r.screenshot}" target="_blank">View Screenshot</a></p>` : ""}
        </div>
      `;
      })
      .join("")}
  </div>
  `
      : ""
  }

  <h2>Summary by Criterion</h2>
  <div class="stat-box">
    <div class="stat">
        <div class="stat-val">${uniqueElements}</div>
        <div>Elements</div>
    </div>
    ${statsHTML}
  </div>

  <div class="filter-buttons">
    ${filterButtonsHTML}
  </div>

  <h2>Element-Level Results</h2>
  <table>
    <thead>
      <tr>
        <th>Criterion</th>
        <th>Result</th>
        <th>Selector</th>
        <th>Reason</th>
        <th>Screenshot</th>
        <th>Evidence</th>
      </tr>
    </thead>
    <tbody>
      ${elementLevelResults
        .map(
          (r) => `
      <tr data-sc="${r.sc}" data-result="${r.result}">
        <td><span class="criterion-badge badge-${r.sc.replace(/\./g, "")}">${r.sc}</span></td>
        <td class="${r.result.toLowerCase()}">${r.result}</td>
        <td><code>${escapeHtml(r.element?.selector || "N/A")}</code></td>
        <td>${escapeHtml(r.reason)}</td>
        <td>${r.screenshot ? `<a href="${r.screenshot}" target="_blank"><img src="${r.screenshot}" class="screenshot-thumb" alt="Screenshot"></a>` : "N/A"}</td>
        <td>
            <details>
                <summary>Evidence</summary>
                <pre>${escapeHtml(JSON.stringify(r.evidence, null, 2))}</pre>
            </details>
        </td>
      </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>

  <script>
    // Filter failures only
    document.querySelector('.filter-btn:last-child').addEventListener('click', function() {
      const rows = document.querySelectorAll('tbody tr');
      rows.forEach(row => {
        if (row.dataset.result === 'FAIL') {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      this.classList.add('active');
    });
  </script>
</body>
</html>
  `;

  const reportPath = path.join(reportDir, "index.html");
  fs.writeFileSync(reportPath, html);
  return reportPath;
}

// Helper function to escape HTML and prevent XSS
function escapeHtml(text) {
  if (typeof text !== "string") return text;
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Build a set of selectors and labels for 2.4.3 violation elements.
 * @param {Array} violations - Violations array from checkFocusOrder result
 * @returns {{ selectors: Set<string>, labels: Map<string, string> }}
 */
function buildFocusOrderViolationMeta(violations) {
  const selectors = new Set();
  const labels = new Map();

  const addLabel = (sel, label) => {
    selectors.add(sel);
    labels.set(sel, labels.has(sel) ? `${labels.get(sel)}, ${label}` : label);
  };

  for (const v of violations) {
    if (v.type === "positive-tabindex" && Array.isArray(v.elements)) {
      for (const el of v.elements) {
        if (el.selector) addLabel(el.selector, `tabindex=${el.tabIndex}`);
      }
    }
    if (v.type === "focus-trap" && Array.isArray(v.elements)) {
      for (const sel of v.elements) {
        if (sel) addLabel(sel, "trap");
      }
    }
    if (v.type === "visual-order-mismatch" && Array.isArray(v.mismatches)) {
      for (const m of v.mismatches) {
        if (m.selector) addLabel(m.selector, "visual order");
      }
    }
  }

  return { selectors, labels };
}

/**
 * Capture an annotated screenshot for WCAG 2.4.3 Focus Order results.
 *
 * Draws tab-order numbered badges (blue) on every element in the tab sequence
 * and red badges/outlines on elements involved in detected violations.
 *
 * @param {import('playwright').Page} page
 * @param {Array} violations - violations array from checkFocusOrder
 * @param {Array} tabSequence - tab sequence array from collectPageData
 * @param {string} filenameBase - base filename (no extension)
 * @param {string} [scId='2.4.3']
 * @returns {Promise<string>} - relative path to saved screenshot
 */
async function captureFocusOrderScreenshot(
  page,
  violations,
  tabSequence,
  filenameBase,
  scId = "2.4.3",
) {
  const reportDir = getReportDir();
  const failureDir = path.join(reportDir, scId);
  if (!fs.existsSync(failureDir)) fs.mkdirSync(failureDir, { recursive: true });

  const { selectors: violSelectors, labels: violLabels } =
    buildFocusOrderViolationMeta(violations);

  // Scroll to the top before injecting overlays so positions are consistent
  await page.evaluate(() => window.scrollTo(0, 0));

  // Clean up any pre-existing overlays
  await page.evaluate(() => {
    document.querySelectorAll(".__a11y_fo_overlay").forEach((e) => e.remove());
  });

  // Inject numbered overlays for the tab sequence
  await page.evaluate(
    ({ sequence, violSels, violLabelsObj }) => {
      const scrollY = window.scrollY || 0;
      const scrollX = window.scrollX || 0;

      sequence.forEach((el, i) => {
        let domEl;
        try {
          domEl = document.querySelector(el.selector);
        } catch (_) {
          return;
        }
        if (!domEl) return;

        const rect = domEl.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const absTop = rect.top + scrollY;
        const absLeft = rect.left + scrollX;
        const isViolating = violSels.includes(el.selector);
        const colour = isViolating ? "#c62828" : "#1565c0";

        // Outline box
        const box = document.createElement("div");
        box.className = "__a11y_fo_overlay";
        Object.assign(box.style, {
          position: "absolute",
          top: `${absTop}px`,
          left: `${absLeft}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          outline: `3px solid ${colour}`,
          outlineOffset: "8px",
          boxSizing: "border-box",
          pointerEvents: "none",
          zIndex: "2147483646",
        });
        document.body.appendChild(box);

        // Tab-order number badge
        const numBadge = document.createElement("div");
        numBadge.className = "__a11y_fo_overlay";
        numBadge.innerText = String(i + 1);
        Object.assign(numBadge.style, {
          position: "absolute",
          top: `${Math.max(0, absTop - 19)}px`,
          left: `${absLeft}px`,
          background: colour,
          color: "white",
          fontSize: "11px",
          fontWeight: "bold",
          padding: "1px 5px",
          borderRadius: "3px",
          pointerEvents: "none",
          zIndex: "2147483647",
          lineHeight: "17px",
          whiteSpace: "nowrap",
        });
        document.body.appendChild(numBadge);

        // Violation label badge (if applicable)
        const label = violLabelsObj[el.selector];
        if (label) {
          const lblBadge = document.createElement("div");
          lblBadge.className = "__a11y_fo_overlay";
          lblBadge.innerText = label;
          Object.assign(lblBadge.style, {
            position: "absolute",
            top: `${Math.max(0, absTop - 19)}px`,
            left: `${absLeft + 24}px`,
            background: "#c62828",
            color: "white",
            fontSize: "11px",
            padding: "1px 5px",
            borderRadius: "3px",
            pointerEvents: "none",
            zIndex: "2147483647",
            lineHeight: "17px",
            whiteSpace: "nowrap",
          });
          document.body.appendChild(lblBadge);
        }
      });
    },
    {
      sequence: tabSequence,
      violSels: [...violSelectors],
      violLabelsObj: Object.fromEntries(violLabels),
    },
  );

  const filename = `${filenameBase}.png`;
  const filePath = path.join(failureDir, filename);
  await page.screenshot({ path: filePath, fullPage: true });

  // Clean up overlays
  await page.evaluate(() => {
    document.querySelectorAll(".__a11y_fo_overlay").forEach((e) => e.remove());
  });

  return `${scId}/${filename}`;
}

export {
  initReport,
  captureFailure,
  captureFocusOrderScreenshot,
  generateHtmlReport,
  getReportDir,
};
