import { describe, expect, it } from "vitest";
import { joinCommand, splitCommand } from "./actions";

describe("commands", () => {
  it("splits on spaces, keeping quoted ones", () => {
    expect(splitCommand(`code  "~/my notes" ''`)).toEqual(["code", "~/my notes", ""]);
  });

  it("joins back what it split", () => {
    const words = ["code", "~/my notes", "-n", 'say "hi"'];
    expect(splitCommand(joinCommand(words))).toEqual(words);
  });
});
