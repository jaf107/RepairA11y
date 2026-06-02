import { describe, it, expect, vi, beforeEach } from "vitest";
import { repairLoop } from "../../src/loop/repair_loop.js";

vi.mock("../../src/verifier/index.js", () => ({
  verify: vi.fn(),
}));
import { verify } from "../../src/verifier/index.js";

beforeEach(() => {
  verify.mockReset();
});

const baseViolation = {
  id: "viol-1",
  sc: "2.4.13",
  result: "FAIL",
  element: { selector: "button" },
};

function fakePatch(label = "p1") {
  return {
    patch_type: "css_inject",
    target_selector: "button",
    payload: { rule: `/* ${label} */` },
    rationale: label,
    wcag_technique_cited: null,
  };
}

describe("repairLoop", () => {
  it("returns RESOLVED on first iteration when verify says so", async () => {
    verify.mockResolvedValueOnce({
      status: "RESOLVED",
      targetResolved: true,
      regressed: false,
      ssimRegressed: false,
      resolved: [baseViolation],
      newFailures: [],
      stillFailing: [],
      ssim: { similarity: 0.99 },
    });
    const gen = { generate: vi.fn().mockResolvedValueOnce(fakePatch()) };

    const out = await repairLoop({
      violation: baseViolation,
      htmlFile: "/tmp/x.html",
      generator: gen,
      evidence: { foo: "bar" },
    });
    expect(out.status).toBe("RESOLVED");
    expect(out.iterations).toBe(1);
    expect(gen.generate).toHaveBeenCalledTimes(1);
  });

  it("returns DECLINED when generator returns null", async () => {
    const gen = { generate: vi.fn().mockResolvedValueOnce(null) };
    const out = await repairLoop({
      violation: baseViolation,
      htmlFile: "/tmp/x.html",
      generator: gen,
      evidence: {},
    });
    expect(out.status).toBe("DECLINED");
    expect(out.iterations).toBe(1);
    expect(verify).not.toHaveBeenCalled();
  });

  it("loops up to maxIterations and feeds history to generator", async () => {
    verify.mockResolvedValue({
      status: "UNRESOLVED",
      targetResolved: false,
      regressed: false,
      ssimRegressed: false,
      resolved: [],
      newFailures: [],
      stillFailing: [baseViolation],
      ssim: { similarity: 0.99 },
    });
    const gen = { generate: vi.fn().mockResolvedValue(fakePatch()) };

    const out = await repairLoop({
      violation: baseViolation,
      htmlFile: "/tmp/x.html",
      generator: gen,
      evidence: {},
      maxIterations: 3,
    });
    expect(out.status).toBe("UNRESOLVED");
    expect(out.iterations).toBe(3);
    expect(gen.generate).toHaveBeenCalledTimes(3);
    expect(gen.generate.mock.calls[1][0].history.length).toBe(1);
    expect(gen.generate.mock.calls[2][0].history.length).toBe(2);
  });

  it("captures generator errors and short-circuits", async () => {
    const gen = {
      generate: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom")),
    };
    const out = await repairLoop({
      violation: baseViolation,
      htmlFile: "/tmp/x.html",
      generator: gen,
      evidence: {},
    });
    expect(out.status).toBe("ERROR");
    expect(out.history[0].error).toMatch(/boom/);
  });

  it("REGRESSED verdict continues to next iteration (rollback semantics)", async () => {
    verify
      .mockResolvedValueOnce({
        status: "REGRESSED",
        targetResolved: false,
        regressed: true,
        ssimRegressed: false,
        resolved: [],
        newFailures: [{ id: "new1" }],
        stillFailing: [baseViolation],
        ssim: { similarity: 0.95 },
      })
      .mockResolvedValueOnce({
        status: "RESOLVED",
        targetResolved: true,
        regressed: false,
        ssimRegressed: false,
        resolved: [baseViolation],
        newFailures: [],
        stillFailing: [],
        ssim: { similarity: 0.99 },
      });
    const gen = {
      generate: vi
        .fn()
        .mockResolvedValueOnce(fakePatch("p1"))
        .mockResolvedValueOnce(fakePatch("p2")),
    };
    const out = await repairLoop({
      violation: baseViolation,
      htmlFile: "/tmp/x.html",
      generator: gen,
      evidence: {},
      maxIterations: 3,
    });
    expect(out.status).toBe("RESOLVED");
    expect(out.iterations).toBe(2);
    expect(out.acceptedPatch.rationale).toBe("p2");
  });
});
