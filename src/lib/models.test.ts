import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { load } from "./deck";
import { face, modelFor, models, nextKey } from "./models";

describe("models", () => {
  it("has the D200's key windows as the device draws them", async () => {
    const d = await load(readFileSync(new URL("../wasm/deck.wasm", import.meta.url)));
    expect(modelFor({ keys: 14 } as never).windows).toEqual(d.layout.keys);
  });

  it("picks a model by ID, then by key count, then the first", () => {
    expect(modelFor({ model: "ulanzi,d200", keys: 99 } as never).id).toBe("ulanzi,d200");
    expect(modelFor({ keys: 14 } as never).id).toBe("ulanzi,d200");
    expect(modelFor({ model: "other", keys: 3 } as never)).toBe(models[0]);
    expect(modelFor(null)).toBe(models[0]);
  });

  it("lays out a face with the body around the caps", () => {
    const f = face(models[0]);
    const c0 = f.keys[0].cap;
    const wide = f.keys[13].cap;
    const bottomLeft = f.keys[10].cap;
    expect([c0.x, c0.y]).toEqual([181, 145]);
    expect(f.width - (wide.x + wide.w)).toBe(181);
    expect(f.height - (bottomLeft.y + bottomLeft.h)).toBe(99);
    expect(f.keys[0].window).toEqual({ x: 5, y: 5, w: 196, h: 196 });
  });

  it("finds the key next to another, for arrow keys", () => {
    const { keys } = face(models[0]);
    expect(nextKey(keys, 0, "right")).toBe(1);
    expect(nextKey(keys, 0, "left")).toBe(0);
    expect(nextKey(keys, 4, "down")).toBe(9);
    expect(nextKey(keys, 12, "right")).toBe(13);
    expect(nextKey(keys, 9, "down")).toBe(13);
    expect([8, 9]).toContain(nextKey(keys, 13, "up"));
  });
});
