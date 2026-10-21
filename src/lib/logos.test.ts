import { describe, expect, it } from "vitest";
import { brandColours, contrast, grouped, loadLogos, type Logo } from "./logos";

describe("logos", () => {
  it("measures contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrast("#1c1c1c", "#1c1c1c")).toBe(1);
  });

  it("keeps a brand colour that reads on the key", () => {
    expect(brandColours("#5865F2")).toEqual({ color: "#5865F2" }); // Discord
  });

  it("puts a dark brand colour behind a white logo", () => {
    expect(brandColours("#302E31")).toEqual({ color: "#ffffff", background: "#302E31" }); // OBS
  });

  it("keeps the key's background for a near-black brand", () => {
    expect(brandColours("#000000")).toEqual({ color: "#ffffff" }); // Steam
    expect(brandColours("#181717")).toEqual({ color: "#ffffff" }); // GitHub
  });

  it("measures against the key's own background", () => {
    expect(brandColours("#5865F2", "#5865F2")).toEqual({ color: "#ffffff", background: "#5865F2" });
    expect(brandColours("#000000", "#ffffff")).toEqual({ color: "#000000" });
    expect(brandColours("#1ED760", "#ffffff")).toEqual({ color: "#000000", background: "#1ED760" }); // Spotify
  });

  it("groups logos in the picker's order", () => {
    const b = (name: string, group: string): Logo => ({ name, title: name, hex: "#000000", group });
    const g = grouped([b("steam", "Games"), b("x", "Other"), b("chrome", "Browsers"), b("epic", "Games")]);
    expect(g.map((x) => [x.group, x.logos.map((y) => y.name)])).toEqual([
      ["Browsers", ["chrome"]],
      ["Games", ["steam", "epic"]],
      ["Other", ["x"]],
    ]);
  });
});
