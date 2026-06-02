import { describe, it, expect } from "vitest";
import { packageEvidence } from "../../src/evidence/packager.js";
import { techniqueText, techniquesFor } from "../../src/evidence/techniques/index.js";

const sc2413Violation = {
  id: "v1",
  sc: "2.4.13",
  result: "FAIL",
  element: {
    selector: "button.aaa-outline",
    tagName: "button",
    bbox: { x: 10, y: 20, width: 100, height: 40 },
    attributes: { class: "aaa-outline" },
    visibility: { display: "inline-block" },
  },
  evidence: {
    styleSnapshots: {
      after: {
        outlineWidth: "2px",
        outlineColor: "rgb(153, 153, 153)",
        backgroundColor: "rgb(255, 255, 255)",
      },
    },
    measurements: { outlineWidth: 2 },
    failures: ["contrast<3:1"],
  },
  screenshot: null,
};

describe("packageEvidence — level gating", () => {
  it("E1 includes element + screenshot, NO techniques or runtimeSlice", async () => {
    const b = await packageEvidence({ violation: sc2413Violation, level: "E1" });
    expect(b.level).toBe("E1");
    expect(b.element).toBeTruthy();
    expect(b).not.toHaveProperty("wcagTechniques");
    expect(b).not.toHaveProperty("runtimeSlice");
  });

  it("E2 adds wcagTechniques", async () => {
    const b = await packageEvidence({ violation: sc2413Violation, level: "E2" });
    expect(b.wcagTechniques).toMatch(/F78/);
    expect(b).not.toHaveProperty("runtimeSlice");
  });

  it("E3 adds runtimeSlice with style snapshots", async () => {
    const b = await packageEvidence({ violation: sc2413Violation, level: "E3" });
    expect(b.runtimeSlice).toBeTruthy();
    expect(b.runtimeSlice.styleSnapshots.after.outlineColor).toBe(
      "rgb(153, 153, 153)",
    );
  });

  it("E4 attempts annotation when bbox + screenshot present", async () => {
    const fakeAnnotator = async () => Buffer.from([1, 2, 3]);
    const b = await packageEvidence({
      violation: { ...sc2413Violation, screenshot: "/tmp/fake.png" },
      level: "E4",
      annotator: fakeAnnotator,
    });
    expect(b.screenshot.annotatedCropBase64).toBe(
      Buffer.from([1, 2, 3]).toString("base64"),
    );
  });

  it("E4 skips annotation when no bbox/screenshot", async () => {
    const b = await packageEvidence({
      violation: { ...sc2413Violation, screenshot: null },
      level: "E4",
      annotator: async () => Buffer.from("x"),
    });
    expect(b.screenshot.annotationSkipped).toBeTruthy();
  });

  it("throws on invalid level", async () => {
    await expect(
      packageEvidence({ violation: sc2413Violation, level: "E9" }),
    ).rejects.toThrow(/invalid level/);
  });

  it("bundle size is monotonic E1 < E2 < E3", async () => {
    const e1 = JSON.stringify(
      await packageEvidence({ violation: sc2413Violation, level: "E1" }),
    );
    const e2 = JSON.stringify(
      await packageEvidence({ violation: sc2413Violation, level: "E2" }),
    );
    const e3 = JSON.stringify(
      await packageEvidence({ violation: sc2413Violation, level: "E3" }),
    );
    expect(e1.length).toBeLessThan(e2.length);
    expect(e2.length).toBeLessThan(e3.length);
  });
});

describe("techniques", () => {
  it("techniqueText for 2.4.13 includes F78 and C40", () => {
    const t = techniqueText("2.4.13");
    expect(t).toMatch(/F78/);
    expect(t).toMatch(/C40/);
  });
  it("techniquesFor 2.4.3 includes F44", () => {
    expect(techniquesFor("2.4.3").map((t) => t.code)).toContain("F44");
  });
});

describe("packageEvidence — per-SC runtimeSlice shape", () => {
  it("2.4.11 surfaces obscurer fields", async () => {
    const v = {
      id: "v2",
      sc: "2.4.11",
      result: "FAIL",
      element: { selector: "button.footer-btn", bbox: {} },
      evidence: {
        obscuredRatio: 0.8,
        obscuredBy: [".fixed-footer"],
        obscurers: [{ selector: ".fixed-footer", zIndex: "100" }],
      },
    };
    const b = await packageEvidence({ violation: v, level: "E3" });
    expect(b.runtimeSlice.obscurers).toHaveLength(1);
    expect(b.runtimeSlice.obscuredRatio).toBe(0.8);
  });

  it("2.4.3 surfaces positiveTabindexElements when available", async () => {
    const v = {
      id: "v3",
      sc: "2.4.3",
      result: "FAIL",
      element: null,
      evidence: {
        positiveTabindexElements: [{ selector: "a", tabIndex: 5 }],
      },
    };
    const b = await packageEvidence({ violation: v, level: "E3" });
    expect(b.runtimeSlice.positiveTabindexElements).toHaveLength(1);
  });
});
