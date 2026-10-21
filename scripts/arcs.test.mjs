import { describe, expect, it } from "vitest";
import { noArcs } from "./arcs.mjs";

// the points a converted path passes through: each command's end point
function ends(d) {
  return [...d.matchAll(/[MLCQ]([^MLCQZ]+)/g)].map((m) => {
    const v = m[1].trim().split(/[\s]+|(?=-)/).map(Number);
    return [v.at(-2), v.at(-1)];
  });
}

describe("noArcs", () => {
  it("draws circles as curves through the circle", () => {
    for (const c of [
      { d: "M0 12a12 12 0 1 0 24 0a12 12 0 1 0-24 0z", cx: 12, cy: 12, r: 12 },
      { d: "M2 12A10 10 0 0 1 22 12A10 10 0 0 1 2 12Z", cx: 12, cy: 12, r: 10 },
      { d: "M7 5a5 5 0 110 10 5 5 0 010-10z", cx: 7, cy: 10, r: 5 }, // flags run into numbers
    ]) {
      const d = noArcs(c.d);
      expect(d).not.toMatch(/[Aa]/);
      for (const [x, y] of ends(d)) expect(Math.abs(Math.hypot(x - c.cx, y - c.cy) - c.r)).toBeLessThan(0.01 * c.r);
    }
  });

  it("leaves a path without arcs as it is", () => {
    expect(noArcs("M0 0h1v1z")).toBe("M0 0h1v1z");
  });

  it("doesn't reflect a control point after an arc", () => {
    expect(noArcs("M0 0a1 1 0 0 1 2 0s1 1 2 0").endsWith("C2 0 3 1 4 0")).toBe(true);
  });
});
