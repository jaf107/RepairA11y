import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { applyPatch } from "../../src/patches/applier.js";
import { ApplierError } from "../../src/patches/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

function load(rel) {
  return JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));
}

function fileUrl(rel) {
  return `file://${join(repoRoot, rel)}`;
}

let browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

async function withPage(url, fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url);
  try {
    return await fn(page);
  } finally {
    await ctx.close();
  }
}

describe("applyPatch — css_inject", () => {
  it("injects ground-truth SC 2.4.13 patch and undo restores", async () => {
    const { fixture, patch } = load(
      "ground-truth/sc-2.4.13-focus-appearance-outline-contrast.json",
    );
    await withPage(fileUrl(fixture), async (page) => {
      const before = await page.evaluate(() => {
        const el = document.querySelector("button.aaa-outline");
        el.focus();
        return getComputedStyle(el).outlineColor;
      });

      const handle = await applyPatch(page, patch);
      expect(handle.ok).toBe(true);

      const after = await page.evaluate(() => {
        const el = document.querySelector("button.aaa-outline");
        el.focus();
        return getComputedStyle(el).outlineColor;
      });
      expect(after).not.toBe(before);

      await handle.undo();
      const restored = await page.evaluate(() => {
        const el = document.querySelector("button.aaa-outline");
        el.focus();
        return getComputedStyle(el).outlineColor;
      });
      expect(restored).toBe(before);
    });
  });

  it("injects ground-truth SC 2.4.11 patch and z-index raises", async () => {
    const { fixture, patch } = load(
      "ground-truth/sc-2.4.11-focus-obscured-by-fixed-footer.json",
    );
    await withPage(fileUrl(fixture), async (page) => {
      const before = await page.evaluate(() => {
        return getComputedStyle(
          document.querySelector("button.footer-btn"),
        ).zIndex;
      });
      expect(before).toBe("50");

      const handle = await applyPatch(page, patch);
      const after = await page.evaluate(() => {
        return getComputedStyle(
          document.querySelector("button.footer-btn"),
        ).zIndex;
      });
      expect(after).toBe("150");

      await handle.undo();
      const restored = await page.evaluate(() => {
        return getComputedStyle(
          document.querySelector("button.footer-btn"),
        ).zIndex;
      });
      expect(restored).toBe("50");
    });
  });
});

describe("applyPatch — attr_set", () => {
  it("applies SC 2.4.3 positive-tabindex patch and undo restores", async () => {
    const { fixture, patch } = load(
      "ground-truth/sc-2.4.3-positive-tabindex.json",
    );
    await withPage(fileUrl(fixture), async (page) => {
      const before = await page.evaluate(() => {
        return document
          .querySelector("a[tabindex='5'], a[tabindex='0']")
          ?.getAttribute("tabindex");
      });
      expect(before).toBe("5");

      const handle = await applyPatch(page, patch);
      const after = await page.evaluate(() => {
        return document
          .querySelector("a[tabindex='0']")
          ?.getAttribute("tabindex");
      });
      expect(after).toBe("0");

      await handle.undo();
      const restored = await page.evaluate(() => {
        return document
          .querySelector("a[tabindex='5']")
          ?.getAttribute("tabindex");
      });
      expect(restored).toBe("5");
    });
  });

  it("throws when selector matches nothing", async () => {
    await withPage(
      fileUrl(
        "nava11y/dataset/focus-behavior-dataset/tests/focus-appearance-outline-insufficient-contrast.html",
      ),
      async (page) => {
        await expect(
          applyPatch(page, {
            patch_type: "attr_set",
            target_selector: "div.does-not-exist",
            payload: { attribute: "tabindex", value: "0" },
            rationale: "x",
            wcag_technique_cited: null,
          }),
        ).rejects.toBeInstanceOf(ApplierError);
      },
    );
  });
});

describe("applyPatch — style_override", () => {
  it("sets and reverts inline style", async () => {
    await withPage(
      fileUrl(
        "nava11y/dataset/focus-behavior-dataset/tests/focus-obscured-by-fixed-footer.html",
      ),
      async (page) => {
        const before = await page.evaluate(() => {
          return (
            document.querySelector("button.footer-btn").style.getPropertyValue(
              "z-index",
            ) || ""
          );
        });

        const handle = await applyPatch(page, {
          patch_type: "style_override",
          target_selector: "button.footer-btn",
          payload: { property: "z-index", value: "9999" },
          rationale: "x",
          wcag_technique_cited: null,
        });

        const after = await page.evaluate(() => {
          return document
            .querySelector("button.footer-btn")
            .style.getPropertyValue("z-index");
        });
        expect(after).toBe("9999");

        await handle.undo();
        const restored = await page.evaluate(() => {
          return (
            document
              .querySelector("button.footer-btn")
              .style.getPropertyValue("z-index") || ""
          );
        });
        expect(restored).toBe(before);
      },
    );
  });
});

describe("applyPatch — dom_reorder", () => {
  it("moves element and undo restores original position", async () => {
    await withPage(
      fileUrl(
        "nava11y/dataset/focus-behavior-dataset/tests/focus-obscured-by-fixed-footer.html",
      ),
      async (page) => {
        const before = await page.evaluate(() => {
          const el = document.querySelector("button.footer-btn");
          return {
            parentTag: el.parentElement.tagName,
            nextSiblingTag: el.nextElementSibling?.tagName ?? null,
          };
        });

        const handle = await applyPatch(page, {
          patch_type: "dom_reorder",
          target_selector: "button.footer-btn",
          payload: { parent_selector: "body", insert_before_selector: null },
          rationale: "x",
          wcag_technique_cited: null,
        });

        const after = await page.evaluate(() => {
          return document.querySelector("button.footer-btn").parentElement
            .tagName;
        });
        expect(after).toBe("BODY");

        await handle.undo();
        const restored = await page.evaluate(() => {
          const el = document.querySelector("button.footer-btn");
          return {
            parentTag: el.parentElement.tagName,
            nextSiblingTag: el.nextElementSibling?.tagName ?? null,
          };
        });
        expect(restored.parentTag).toBe(before.parentTag);
      },
    );
  });
});
