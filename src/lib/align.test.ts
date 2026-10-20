import { describe, expect, it } from "vitest";
import { canAlign, nudge, offsetWords } from "./align";
import type { Features } from "./features";
import type { Hello, Settings } from "./proto";

const hello = (settings?: string[]) => ({ features: settings && ({ settings } as Features) }) as Hello;
const s: Settings = { screen_offset: { x: 0, y: 0 }, screen_offset_min: { x: -3, y: -2 }, screen_offset_max: { x: 3, y: 2 } };

describe("align", () => {
  it("is offered only by a device that lists it", () => {
    expect(canAlign(hello(["brightness", "screen_offset", "screen_pattern"]), s)).toBe(true);
    expect(canAlign(hello(["brightness"]), { brightness: 100 })).toBe(false); // older software
    expect(canAlign(hello(), { brightness: 100 })).toBe(false); // no features at all
    expect(canAlign(hello(["screen_offset", "screen_pattern"]), { brightness: 100 })).toBe(false); // not in the reply
  });

  it("moves a pixel a step, within the device's range", () => {
    expect(nudge({ x: 0, y: 0 }, 1, 0, s)).toEqual({ x: 1, y: 0 });
    expect(nudge({ x: 3, y: -2 }, 1, -1, s)).toEqual({ x: 3, y: -2 });
    expect(nudge({ x: -3, y: 2 }, -1, 1, s)).toEqual({ x: -3, y: 2 });
  });

  it("says where the picture is", () => {
    expect(offsetWords({ x: 0, y: 0 })).toBe("Default position");
    expect(offsetWords({ x: 2, y: -1 })).toBe("2 px right, 1 px up");
    expect(offsetWords({ x: -1, y: 0 })).toBe("1 px left");
    expect(offsetWords({ x: 0, y: 3 })).toBe("3 px down");
  });
});
