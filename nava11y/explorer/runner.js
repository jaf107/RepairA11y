import { chromium } from "playwright";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  captureFailure,
  captureFocusOrderScreenshot,
  generateHtmlReport,
  initReport,
  getReportDir,
} from "../reporter/index.js";

// Load configuration
const CONFIG_PATH = path.join(process.cwd(), "config", "default.json");
let config = {};
if (fs.existsSync(CONFIG_PATH)) {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

/**
 * Dynamically load enabled checks from configuration
 * This decouples the runner from specific check implementations
 */
async function loadChecks() {
  const enabledChecks = config.checks?.enabled || [];
  const registry = config.checks?.registry || {};

  const checks = [];

  for (const checkId of enabledChecks) {
    const checkConfig = registry[checkId];
    if (!checkConfig) {
      console.warn(
        `Warning: Check ${checkId} is enabled but not found in registry`,
      );
      continue;
    }

    try {
      const checkModule = await import(checkConfig.module);
      const checkFn = checkModule[checkConfig.function];

      if (typeof checkFn !== "function") {
        console.warn(
          `Warning: ${checkConfig.function} not found in ${checkConfig.module}`,
        );
        continue;
      }

      checks.push({
        id: checkId,
        name: checkConfig.name,
        level: checkConfig.level,
        checkLevel: checkConfig.checkLevel,
        fn: checkFn,
        config: config.thresholds?.[checkId] || {},
      });

      console.log(
        `Loaded check: ${checkId} (${checkConfig.name} - Level ${checkConfig.level})`,
      );
    } catch (error) {
      console.error(`Error loading check ${checkId}:`, error.message);
    }
  }

  return checks;
}

const INSTRUMENTATION_PATH = path.join(
  process.cwd(),
  "instrumentation",
  "index.js",
);

/**
 * Collect page-level data for page-level checks (e.g., 2.4.3 Focus Order)
 */
async function collectPageData(page, url) {
  console.log("Collecting page-level data for focus order analysis...");

  // Get DOM order of focusable elements
  const domOrder = await page.evaluate(() => {
    return window.__getAllFocusableElements
      ? window.__getAllFocusableElements()
      : [];
  });

  // Simulate Tab navigation to capture actual focus sequence
  const tabSequence = [];
  const maxTabIterations = Math.min(domOrder.length + 10, 200); // Safety limit

  console.log(
    `  Simulating Tab navigation (max ${maxTabIterations} iterations)...`,
  );

  // Focus on document body to start
  await page.evaluate(() => {
    if (document.body) document.body.focus();
  });

  for (let i = 0; i < maxTabIterations; i++) {
    // Press Tab key
    await page.keyboard.press("Tab");
    await page.waitForTimeout(50); // Wait for focus to shift

    // Capture currently focused element
    const focusedData = await page.evaluate(() => {
      return window.__captureFocusedElement
        ? window.__captureFocusedElement()
        : null;
    });

    if (!focusedData) {
      // No element focused or focus went to body/document
      break;
    }

    // Check if we've cycled back to start
    if (
      tabSequence.length > 0 &&
      tabSequence[0].selector === focusedData.selector
    ) {
      console.log(`  Tab sequence completed after ${i + 1} iterations`);
      break;
    }

    tabSequence.push(focusedData);

    // Safety: if same element appears 3 times, we might be in a trap
    const lastThree = tabSequence.slice(-3);
    if (
      lastThree.length === 3 &&
      lastThree.every((el) => el.selector === focusedData.selector)
    ) {
      console.warn(
        `  Warning: Potential focus trap detected on ${focusedData.selector}`,
      );
      break;
    }
  }

  console.log(`  Captured tab sequence: ${tabSequence.length} elements`);

  return {
    url,
    domOrder,
    tabSequence,
  };
}

async function run(url) {
  initReport(url);

  // Load all enabled checks dynamically
  const checks = await loadChecks();
  console.log(
    `Loaded ${checks.length} check(s): ${checks.map((c) => `${c.id} (${c.level})`).join(", ")}`,
  );

  console.log(`Starting check for ${url}...`);
  const headless = config.browser?.headless ?? true;
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  // Inject instrumentation
  if (fs.existsSync(INSTRUMENTATION_PATH)) {
    const instrumentationScript = fs.readFileSync(INSTRUMENTATION_PATH, "utf8");
    await page.addInitScript(instrumentationScript);
  } else {
    console.error(`Instrumentation file not found at ${INSTRUMENTATION_PATH}`);
    await browser.close();
    process.exit(1);
  }

  // Navigate with retry logic and better wait strategies
  const hydrationDelay = config.delays?.hydration ?? 2000;

  try {
    console.log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: "load",
      timeout: 60000, // 60 second timeout for initial page load
    });
    console.log(`Page loaded. Waiting ${hydrationDelay}ms for hydration...`);
    await page.waitForTimeout(hydrationDelay);

    // Verify page didn't error out or redirect to CAPTCHA
    const finalUrl = page.url();
    if (finalUrl !== url && !finalUrl.startsWith(url)) {
      console.warn(`Warning: Page redirected from ${url} to ${finalUrl}`);
    }
  } catch (error) {
    console.error(`Failed to load page: ${error.message}`);
    await browser.close();
    throw new Error(`Page load failed: ${error.message}`);
  }

  const results = [];

  // === PAGE-LEVEL CHECKS ===
  const pageLevelChecks = checks.filter((c) => c.checkLevel === "page");
  const elementLevelChecks = checks.filter((c) => c.checkLevel !== "page");

  if (pageLevelChecks.length > 0) {
    console.log(`\nRunning ${pageLevelChecks.length} page-level check(s)...`);

    // Collect page data once for all page-level checks
    const pageData = await collectPageData(page, url);

    for (const check of pageLevelChecks) {
      console.log(`\nRunning page-level check: ${check.id} (${check.name})...`);

      try {
        // Run check
        const result = check.fn(pageData, check.config);

        console.log(`  ${check.id}: ${result.result} - ${result.reason}`);

        // Capture per-violation screenshots for page-level checks.
        // Extract element selectors from each violation so we can highlight the
        // actual offending elements instead of just painting the body red.
        let screenshot = null;
        const violationScreenshots = [];

        if (result.result === "FAIL" || result.result === "REVIEW") {
          // For SC 2.4.3, produce a single annotated full-page screenshot that
          // numbers every Tab stop and highlights violating elements in red.
          // The annotated shot is sufficient — skip per-element shots which
          // produce blank duplicates when selectors contain browser-generated
          // characters (e.g. eBay's [0]-@ suffixes) that are invalid CSS.
          if (check.id === "2.4.3" && pageData.tabSequence?.length > 0) {
            screenshot = await captureFocusOrderScreenshot(
              page,
              result.violations || [],
              pageData.tabSequence,
              `${result.result.toLowerCase()}_${check.id.replace(/\./g, "_")}`,
              check.id,
            );
          } else {
            const violations = result.violations || [];

            // Build a flat list of { selector, label, violationType } from every violation
            const targets = [];
            for (const v of violations) {
              if (v.type === "positive-tabindex" && Array.isArray(v.elements)) {
                for (const el of v.elements) {
                  targets.push({
                    selector: el.selector,
                    label: `${check.id}: tabindex=${el.tabIndex}`,
                    violationType: v.type,
                  });
                }
              } else if (v.type === "focus-trap" && Array.isArray(v.elements)) {
                for (const sel of v.elements) {
                  targets.push({
                    selector: sel,
                    label: `${check.id}: focus trap`,
                    violationType: v.type,
                  });
                }
              } else if (
                v.type === "visual-order-mismatch" &&
                Array.isArray(v.mismatches)
              ) {
                for (const m of v.mismatches) {
                  if (m.selector)
                    targets.push({
                      selector: m.selector,
                      label: `${check.id}: visual order mismatch`,
                      violationType: v.type,
                    });
                }
              }
            }

            if (targets.length > 0) {
              let screenshotIndex = 0;
              for (const target of targets) {
                try {
                  const shot = await captureFailure(
                    page,
                    target.selector,
                    target.label,
                    `${result.result.toLowerCase()}_${check.id.replace(/\./g, "_")}_${screenshotIndex++}`,
                    check.id,
                  );
                  violationScreenshots.push({
                    selector: target.selector,
                    violationType: target.violationType,
                    screenshot: shot,
                  });
                  if (!screenshot) screenshot = shot; // keep first as primary
                } catch (_) {
                  /* element may no longer be in DOM */
                }
              }
            }

            // Fallback: whole-page shot when no element selectors are available
            if (!screenshot) {
              screenshot = await captureFailure(
                page,
                "body",
                `${check.id}: ${result.reason}`,
                `${result.result.toLowerCase()}_${check.id.replace(/\./g, "_")}`,
                check.id,
              );
            }
          } // end else (non-2.4.3 checks)
        }

        results.push({
          ...result,
          ...(result.result === "FAIL" && { id: crypto.randomUUID() }),
          screenshot,
          violationScreenshots:
            violationScreenshots.length > 0 ? violationScreenshots : undefined,
          checkType: "page-level",
        });
      } catch (error) {
        console.error(`  Error running page-level check ${check.id}:`, error);
        results.push({
          result: "ERROR",
          reason: `Check execution failed: ${error.message}`,
          evidence: { error: error.message },
          sc: check.id,
          checkType: "page-level",
        });
      }
    }
  }

  // === ELEMENT-LEVEL CHECKS ===
  if (elementLevelChecks.length > 0) {
    console.log(
      `\nRunning ${elementLevelChecks.length} element-level check(s)...`,
    );

    const elements = await page.evaluate(() => {
      // Methodology: Sequential Focus Navigation (Tabbable) only.
      // Sources: ACT Rules, W3C Focus Visible Understanding.
      const candidates = document.querySelectorAll(
        "a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]",
      );

      const isTabbable = (el) => {
        // 1. Must be rendered and visible
        // checkVisibility is standard in modern browsers (Chrome 85+)
        if (
          !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        )
          return false;

        // 2. Must not be disabled (form controls)
        if (el.disabled) return false;

        // 3. Must not be inert
        if (el.closest("[inert]")) return false;

        // 4. Must satisfy Sequential Focus Navigation (tabIndex >= 0)
        // Note: Browsers automatically handle default tabIndex for standard interactive elements.
        // We explicitly check the property.
        if (el.tabIndex < 0) return false;

        // 5. Special cases
        if (el.tagName === "INPUT" && el.type === "hidden") return false;
        if (
          el.tagName === "A" &&
          !el.hasAttribute("href") &&
          !el.hasAttribute("tabindex")
        )
          return false; // Anchor without href is not tabbable by default

        return true;
      };

      const getSelector = (el) => {
        if (el.id) return `#${el.id}`;
        let path = [];
        while (el.nodeType === Node.ELEMENT_NODE) {
          let selector = el.nodeName.toLowerCase();
          if (el.id) {
            selector += `#${el.id}`;
            path.unshift(selector);
            break;
          }
          let sib = el,
            nth = 1;
          while ((sib = sib.previousElementSibling)) {
            if (sib.nodeName.toLowerCase() === selector) nth++;
          }
          if (nth !== 1) selector += `:nth-of-type(${nth})`;
          path.unshift(selector);
          el = el.parentNode;
        }
        return path.join(" > ");
      };

      let idCounter = 0;

      // Filter strictly by tabbability
      return Array.from(candidates)
        .filter(isTabbable)
        .map((el) => ({
          id: `E${++idCounter}`,
          selector: getSelector(el),
          tagName: el.tagName.toLowerCase(),
          uniqueSelector: getSelector(el),
        }));
    });

    console.log(`  Found ${elements.length} candidates.`);

    for (const elMetadata of elements) {
      console.log(`  Testing ${elMetadata.selector}...`);

      try {
        // Ensure no element has focus before capturing the unfocused state.
        // Without this, the element may retain focus from Phase A (tab sequence)
        // or from the previous iteration, causing identical before/after snapshots.
        await page.evaluate(() => {
          if (
            document.activeElement &&
            document.activeElement !== document.body
          ) {
            document.activeElement.blur();
          }
        });
        await page.waitForTimeout(100); // Allow blur styles to settle

        // Scroll and capture BEFORE
        const beforeStyle = await page.evaluate(async (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          el.scrollIntoView({ block: "center", behavior: "instant" });
          return window.__snapshotComputedStyle(el);
        }, elMetadata.selector);

        if (!beforeStyle) {
          console.warn(
            `    Could not find element ${elMetadata.selector} for before-snapshot`,
          );
          continue;
        }

        // Focus
        await page.focus(elMetadata.selector);
        await page.waitForTimeout(300); // Wait for transition/animation

        // Capture AFTER
        const afterStyle = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          return window.__snapshotComputedStyle
            ? window.__snapshotComputedStyle(el)
            : null;
        }, elMetadata.selector);

        const obscuration = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          return window.__getObscurationData
            ? window.__getObscurationData(el)
            : null;
        }, elMetadata.selector);

        const trace = {
          element: elMetadata,
          before: beforeStyle,
          after: afterStyle,
          obscuration: obscuration,
        };

        // Run element-level checks only
        for (const check of elementLevelChecks) {
          const result = check.fn(trace, check.config);

          console.log(
            `    ${check.id} (${check.level}): ${result.result} - ${result.reason}`,
          );

          // Capture screenshot ONLY if this specific check fails
          let screenshot = null;
          if (result.result === "FAIL") {
            screenshot = await captureFailure(
              page,
              elMetadata.selector,
              `${check.id}: ${result.reason}`,
              `fail_${check.id.replace(/\./g, "_")}_${elMetadata.id}`,
              check.id,
            );
          }

          // Attach raw style snapshots to evidence for focus-appearance SCs
          // (consumed by downstream repair tooling; preserves backwards compat).
          const attachSnapshots =
            (check.id === "2.4.7" || check.id === "2.4.13") &&
            (result.result === "FAIL" || result.result === "REVIEW");
          const evidenceWithSnapshots = attachSnapshots
            ? {
                ...(result.evidence || {}),
                styleSnapshots: { before: beforeStyle, after: afterStyle },
              }
            : result.evidence;

          // Push result for this check
          results.push({
            ...result,
            ...(attachSnapshots && { evidence: evidenceWithSnapshots }),
            ...(result.result === "FAIL" && { id: crypto.randomUUID() }),
            element: elMetadata,
            screenshot: screenshot,
            checkType: "element-level",
          });
        }
      } catch (e) {
        console.error(`    Error processing ${elMetadata.selector}:`, e);
      }
    }
  }

  await browser.close();

  // Generate Reports
  const reportDir = getReportDir();
  const jsonPath = path.join(reportDir, "results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  const reportPath = generateHtmlReport(results);

  // Dynamic summary by criterion
  console.log(`\n${"=".repeat(60)}`);
  for (const check of checks) {
    const checkResults = results.filter((r) => r.sc === check.id);
    const failures = checkResults.filter((r) => r.result === "FAIL").length;
    console.log(
      `WCAG ${check.id} ${check.name} (${check.level}): ${failures} failures / ${checkResults.length} total`,
    );
  }
  console.log(`${"=".repeat(60)}\n`);
  console.log(`Report generated at: ${reportPath}`);
  console.log(`JSON results at: ${jsonPath}`);
  return results;
}

export { run };
