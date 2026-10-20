import { describe, expect, it } from "vitest";
import { gunzip, gzip } from "./gzip";

describe("gzip", () => {
  it("round-trips, smaller", async () => {
    const b = new TextEncoder().encode(JSON.stringify({ pages: Array(200).fill({ label: "Hello", action: { type: "back" } }) }));
    const z = await gzip(b);
    expect(z.length).toBeLessThan(b.length / 10);
    expect(await gunzip(z, b.length)).toEqual(b);
  });

  it("stops at the limit, and refuses what isn't gzip", async () => {
    const z = await gzip(new Uint8Array(100_000));
    await expect(gunzip(z, 1000)).rejects.toThrow("larger than 1000 bytes");
    await expect(gunzip(new Uint8Array([1, 2, 3]), 1000)).rejects.toThrow("not gzip data");
  });
});
