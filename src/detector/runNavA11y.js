import { spawn as nodeSpawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";
import { sanitizeUrl } from "./sanitizeUrl.js";
import { DetectorError } from "./errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_NAVA11Y_DIR = resolvePath(__dirname, "..", "..", "nava11y");

function buildArgs({ url, htmlFile }) {
  if (url && htmlFile) {
    throw new DetectorError(
      "runNavA11y: pass either { url } or { htmlFile }, not both",
    );
  }
  if (!url && !htmlFile) {
    throw new DetectorError(
      "runNavA11y: must provide either { url } or { htmlFile }",
    );
  }
  if (url) {
    return { args: [url], inputUrl: url };
  }
  const absolute = resolvePath(htmlFile);
  return { args: ["--file", absolute], inputUrl: `file://${absolute}` };
}

function collectStreams(child) {
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return {
    wait: () =>
      new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
      }),
  };
}

/**
 * Spawn `node run-check.js ...` and resolve the generated results.json path.
 *
 * Returns: { reportDir, resultsPath, stdout, stderr, inputUrl }
 *
 * The caller is responsible for reading + parsing results.json (so tests can
 * stub spawn without also stubbing fs). index.runDetection() composes the two.
 *
 * @param {object} opts
 * @param {string} [opts.url]         Remote URL (mutually exclusive with htmlFile)
 * @param {string} [opts.htmlFile]    Local HTML file path
 * @param {string} [opts.navA11yDir]  NavA11y working directory (default: ../nava11y)
 * @param {Function} [opts.spawn]     child_process.spawn replacement for tests
 */
export async function runNavA11y({
  url,
  htmlFile,
  navA11yDir = DEFAULT_NAVA11Y_DIR,
  spawn = nodeSpawn,
} = {}) {
  const { args, inputUrl } = buildArgs({ url, htmlFile });

  const child = spawn("node", ["run-check.js", ...args], {
    cwd: navA11yDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const { wait } = collectStreams(child);

  let result;
  try {
    result = await wait();
  } catch (error) {
    throw new DetectorError(
      `NavA11y subprocess failed to start: ${error.message}`,
      { cause: error },
    );
  }

  const { code, stdout, stderr } = result;
  if (code !== 0) {
    throw new DetectorError(
      `NavA11y exited with code ${code}: ${stderr.trim() || "(no stderr)"}`,
      { exitCode: code, stderr },
    );
  }

  const reportDir = join(navA11yDir, "reports", sanitizeUrl(inputUrl));
  const resultsPath = join(reportDir, "results.json");

  if (!existsSync(resultsPath)) {
    throw new DetectorError(
      `NavA11y report missing at ${resultsPath}`,
      { reportPath: resultsPath, stderr },
    );
  }

  return { reportDir, resultsPath, stdout, stderr, inputUrl };
}

/**
 * Read + parse results.json from a known path. Split out so it can be reused
 * by integration tests that skip the subprocess.
 */
export async function readResults(resultsPath) {
  let raw;
  try {
    raw = await readFile(resultsPath, "utf8");
  } catch (error) {
    throw new DetectorError(
      `Failed to read NavA11y report at ${resultsPath}: ${error.message}`,
      { cause: error, reportPath: resultsPath },
    );
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new DetectorError(
      `NavA11y report invalid JSON (${resultsPath}): ${error.message}`,
      { cause: error, reportPath: resultsPath },
    );
  }
}
