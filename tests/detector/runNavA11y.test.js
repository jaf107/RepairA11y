import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNavA11y, readResults } from "../../src/detector/runNavA11y.js";
import { DetectorError } from "../../src/detector/errors.js";

/**
 * Minimal fake child_process.ChildProcess for unit tests. We emit stdout/stderr
 * 'data' events before 'close' so runNavA11y's stream collector captures them
 * — matching the real subprocess ordering.
 */
function makeFakeChild({ exitCode = 0, stdout = "", stderr = "", emitError } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  setImmediate(() => {
    if (emitError) {
      child.emit("error", emitError);
      return;
    }
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", exitCode);
  });
  return child;
}

/**
 * Create a temporary nava11y-shaped directory with a prebuilt results.json at
 * reports/<sanitized>/results.json — mirrors what the subprocess would leave
 * behind on disk, without actually spawning anything.
 */
function stageFakeNavA11y(sanitized, resultsArray) {
  const dir = mkdtempSync(join(tmpdir(), "repaira11y-detector-"));
  const reportDir = join(dir, "reports", sanitized);
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    join(reportDir, "results.json"),
    JSON.stringify(resultsArray),
    "utf8",
  );
  return { navA11yDir: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("runNavA11y argument validation", () => {
  it("throws when neither url nor htmlFile is provided", async () => {
    await expect(runNavA11y({})).rejects.toThrow(DetectorError);
  });

  it("throws when both url and htmlFile are provided", async () => {
    await expect(
      runNavA11y({ url: "https://example.com", htmlFile: "/tmp/x.html" }),
    ).rejects.toThrow(DetectorError);
  });
});

describe("runNavA11y subprocess handling", () => {
  it("resolves reportDir + resultsPath on successful exit", async () => {
    const { navA11yDir, cleanup } = stageFakeNavA11y("example_com", [
      { sc: "2.4.7", result: "PASS", checkType: "element-level" },
    ]);
    try {
      const spawn = () => makeFakeChild({ exitCode: 0, stdout: "done" });
      const out = await runNavA11y({
        url: "https://example.com",
        navA11yDir,
        spawn,
      });
      expect(out.reportDir).toBe(join(navA11yDir, "reports", "example_com"));
      expect(out.resultsPath).toBe(
        join(navA11yDir, "reports", "example_com", "results.json"),
      );
      expect(out.inputUrl).toBe("https://example.com");
    } finally {
      cleanup();
    }
  });

  it("throws DetectorError with stderr on non-zero exit", async () => {
    const { navA11yDir, cleanup } = stageFakeNavA11y("example_com", []);
    try {
      const spawn = () =>
        makeFakeChild({ exitCode: 2, stderr: "boom: invalid url" });
      await expect(
        runNavA11y({ url: "https://example.com", navA11yDir, spawn }),
      ).rejects.toMatchObject({
        name: "DetectorError",
        exitCode: 2,
        message: expect.stringMatching(/exited with code 2.*boom: invalid url/),
      });
    } finally {
      cleanup();
    }
  });

  it("throws DetectorError when spawn emits error", async () => {
    const { navA11yDir, cleanup } = stageFakeNavA11y("example_com", []);
    try {
      const spawn = () =>
        makeFakeChild({ emitError: new Error("ENOENT: node not found") });
      await expect(
        runNavA11y({ url: "https://example.com", navA11yDir, spawn }),
      ).rejects.toMatchObject({
        name: "DetectorError",
        message: expect.stringMatching(/failed to start.*ENOENT/),
      });
    } finally {
      cleanup();
    }
  });

  it("throws DetectorError when results.json is missing after success", async () => {
    const { navA11yDir, cleanup } = stageFakeNavA11y("other_site", []);
    // We staged other_site, but point the call at a URL that sanitizes to example_com.
    try {
      const spawn = () => makeFakeChild({ exitCode: 0 });
      await expect(
        runNavA11y({ url: "https://example.com", navA11yDir, spawn }),
      ).rejects.toMatchObject({
        name: "DetectorError",
        message: expect.stringMatching(/report missing at/),
      });
    } finally {
      cleanup();
    }
  });
});

describe("readResults", () => {
  it("parses a valid JSON file", async () => {
    const { navA11yDir, cleanup } = stageFakeNavA11y("example_com", [
      { sc: "2.4.13", result: "FAIL", checkType: "element-level" },
    ]);
    try {
      const out = await readResults(
        join(navA11yDir, "reports", "example_com", "results.json"),
      );
      expect(out).toHaveLength(1);
      expect(out[0].sc).toBe("2.4.13");
    } finally {
      cleanup();
    }
  });

  it("throws DetectorError on missing file", async () => {
    await expect(readResults("/nonexistent/path/results.json")).rejects.toThrow(
      DetectorError,
    );
  });

  it("throws DetectorError on invalid JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repaira11y-bad-"));
    const p = join(dir, "results.json");
    writeFileSync(p, "{ not valid json", "utf8");
    try {
      await expect(readResults(p)).rejects.toMatchObject({
        name: "DetectorError",
        message: expect.stringMatching(/invalid JSON/),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
