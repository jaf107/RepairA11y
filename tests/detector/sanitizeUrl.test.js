import { describe, it, expect } from "vitest";
import { sanitizeUrl } from "../../src/detector/sanitizeUrl.js";

describe("sanitizeUrl", () => {
  it("matches NavA11y's reporter for https://www.qualtrics.com", () => {
    expect(sanitizeUrl("https://www.qualtrics.com")).toBe("www_qualtrics_com");
  });

  it("matches NavA11y's reporter for http:// with path and query", () => {
    expect(sanitizeUrl("http://example.com/foo/bar?x=1")).toBe(
      "example_com_foo_bar_x_1",
    );
  });

  it("matches NavA11y's reporter for file:// URLs (no scheme strip)", () => {
    // NavA11y only strips http(s)://, so file:// becomes underscores.
    expect(
      sanitizeUrl(
        "file:///Users/a/Documents/projects/RepairA11y/nava11y/dataset/focus-behavior-dataset/tests/keyboard-access-tabindex-greater-than-0.html",
      ),
    ).toBe(
      "file____users_a_documents_projects_repaira11y_nava11y_dataset_focus_behavior_dataset_tests_keyboard_access_tabindex_greater_than_0_html",
    );
  });

  it("throws on non-string input", () => {
    expect(() => sanitizeUrl(null)).toThrow(TypeError);
    expect(() => sanitizeUrl("")).toThrow(TypeError);
    expect(() => sanitizeUrl(42)).toThrow(TypeError);
  });
});
