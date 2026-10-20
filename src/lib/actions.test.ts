import { describe, expect, it } from "vitest";
import { argNames, describe as describeAction, joinCommand, newAction, splitCommand, typeTextProblem } from "./actions";

describe("commands", () => {
  it("splits on spaces, keeping quoted ones", () => {
    expect(splitCommand(`code  "~/my notes" ''`)).toEqual(["code", "~/my notes", ""]);
  });

  it("joins back what it split", () => {
    const words = ["code", "~/my notes", "-n", 'say "hi"'];
    expect(splitCommand(joinCommand(words))).toEqual(words);
  });
});

describe("new actions", () => {
  it("start ready to save where they can", () => {
    expect(newAction("hid-consumer")).toEqual({ type: "hid-consumer", usage: "play-pause" });
    expect(newAction("hid-system")).toEqual({ type: "hid-system", system: "sleep" });
    expect(newAction("app", { obs: ["scene"] })).toEqual({ type: "app", app: "obs", op: "scene" });
    expect(newAction("")).toEqual({});
  });

  it("keep a fallback between PC actions", () => {
    const fallback = { type: "hid-key", keys: ["f13"] };
    expect(newAction("open-url", {}, { type: "launch", fallback }).fallback).toBe(fallback);
    expect(newAction("hid-key", {}, { type: "launch", fallback }).fallback).toBeUndefined();
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

describe("now playing", () => {
  it("reads a player, what to show and how long", () => {
    expect(argNames("media", "now-playing")).toEqual(["id", "show", "cycle"]);
    expect(argNames("media", "next")).toEqual(["id"]);
    expect(argNames("discord", "mute")).toEqual([]);
  });
});
