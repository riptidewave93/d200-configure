import { describe, expect, it } from "vitest";
import { emojiChar, emojiID, emojis, search } from "./emoji";

describe("emoji", () => {
  it("loads emoji to pick, without skin tone parts", async () => {
    const all = await emojis();
    expect(all.length).toBeGreaterThan(1500);
    expect(all[0].char).toBe("😀");
    expect(all.some((e) => e.name.includes("skin tone") && e.char.length <= 2)).toBe(false);
  });

  it("finds emoji by name and search words", async () => {
    const all = await emojis();
    expect(search(all, "video game")[0].char).toBe("🎮");
    expect(search(all, "controller").map((e) => e.char)).toContain("🎮");
    expect(search(all, "zzzzqx")).toEqual([]);
    expect(search(all, "  ")).toBe(all);
  });

  it("names emoji icons by code point", () => {
    expect(emojiID("1F3AE")).toBe("emoji-1f3ae");
    expect(emojiChar("emoji-1f3ae")).toBe("🎮");
    expect(emojiChar(emojiID("1F9D1-200D-1F4BB"))).toBe("🧑‍💻");
    expect(emojiChar("mic")).toBe("");
  });
});
