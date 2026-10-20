import { describe, expect, it } from "vitest";
import { describe as describeAction, joinCommand, splitCommand, typeTextProblem } from "./actions";

describe("commands", () => {
  it("splits on spaces, keeping quoted ones", () => {
    expect(splitCommand(`code  "~/my notes" ''`)).toEqual(["code", "~/my notes", ""]);
  });

  it("joins back what it split", () => {
    const words = ["code", "~/my notes", "-n", 'say "hi"'];
    expect(splitCommand(joinCommand(words))).toEqual(words);
  });
});

describe("words for actions", () => {
  it("describes device actions", () => {
    expect(describeAction({ type: "hid-key", keys: ["ctrl", "shift", "m"] })).toBe("ctrl + shift + m");
    expect(describeAction({ type: "hid-consumer", usage: "play-pause" })).toBe("the Play / pause key");
    expect(describeAction({ type: "hid-consumer", usage: 205 })).toBe("media key 205");
  });

  it("says what the device won't type", () => {
    expect(typeTextProblem("brb\n")).toBe("");
    expect(typeTextProblem("café ✓")).toBe("It can't type é ✓: only plain letters, digits and symbols (ASCII).");
    expect(typeTextProblem("x".repeat(1025))).toBe("Up to 1024 characters.");
  });
});
