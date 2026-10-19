import { describe, expect, it } from "vitest";
import type { Button, Config } from "./config";
import { pageTree, pathTo } from "./pages";

const open = (page: string): Button => ({ action: { type: "page", page } });

function config(pages: Record<string, Record<number, Button>>, home = "main"): Config {
  return {
    version: 1,
    home,
    pages: Object.fromEntries(Object.entries(pages).map(([n, keys]) => [n, { keys }])),
  };
}

// names prints a tree as nested arrays, for short expectations
const names = (n: { page: string; children: unknown[] }): unknown =>
  n.children.length ? [n.page, n.children.map((c) => names(c as never))] : n.page;

describe("pageTree", () => {
  it("nests pages by the keys that open them, in key order", () => {
    const t = pageTree(config({ main: { 3: open("b"), 1: open("a") }, a: { 0: open("a1") }, a1: {}, b: {} }));
    expect(names(t.root!)).toEqual(["main", [["a", ["a1"]], "b"]]);
    expect(pathTo(t, "a1")).toEqual(["main", "a", "a1"]);
  });

  it("puts a page opened from two places where it's found first", () => {
    const t = pageTree(config({ main: { 0: open("a"), 1: open("shared") }, a: { 0: open("shared") }, shared: {} }));
    expect(names(t.root!)).toEqual(["main", ["a", "shared"]]);
    expect(pathTo(t, "shared")).toEqual(["main", "shared"]);
  });

  it("stops at loops and keys that go back up", () => {
    const t = pageTree(config({ main: { 0: open("a"), 1: open("main") }, a: { 0: open("main"), 1: open("a") } }));
    expect(names(t.root!)).toEqual(["main", ["a"]]);
  });

  it("lists pages no key opens apart", () => {
    const t = pageTree(config({ main: {}, zed: {}, old: { 0: open("main") } }));
    expect(names(t.root!)).toEqual("main");
    expect(t.orphans).toEqual(["old", "zed"]);
    expect(pathTo(t, "old")).toEqual(["old"]);
  });

  it("ignores keys opening pages that don't exist", () => {
    const t = pageTree(config({ main: { 0: open("gone") } }));
    expect(names(t.root!)).toEqual("main");
  });

  it("copes with a missing home page", () => {
    const t = pageTree(config({ a: {} }, "nope"));
    expect(t.root).toBeNull();
    expect(t.orphans).toEqual(["a"]);
  });
});
