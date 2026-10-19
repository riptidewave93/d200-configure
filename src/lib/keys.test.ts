import { describe, expect, it } from "vitest";
import { formatCombo, keyName, ordered, parseCombo } from "./keys";

describe("keys", () => {
  it("names browser keys", () => {
    expect(["KeyM", "Digit0", "F13", "F25", "ControlLeft", "Period", "Fn"].map(keyName)).toEqual([
      "m",
      "0",
      "f13",
      "",
      "ctrl",
      "dot",
      "",
    ]);
  });

  it("puts modifiers first", () => {
    expect(ordered(["m", "shift", "ctrl"])).toEqual(["ctrl", "shift", "m"]);
  });

  it("formats and parses combos", () => {
    expect(formatCombo(["ctrl", "shift", "m"])).toBe("ctrl + shift + m");
    expect(parseCombo(" Ctrl+shift + M ")).toEqual(["ctrl", "shift", "m"]);
  });
});
