// Screen alignment: moving the picture on the device's screen a pixel at a
// time, within the range it reports.

import type { Hello, Offset, Settings } from "./proto";

// canAlign says whether the device takes screen alignment.
export function canAlign(hello?: Hello | null, s?: Settings | null): boolean {
  const l = hello?.features?.settings ?? [];
  return l.includes("screen_offset") && l.includes("screen_pattern") && !!s?.screen_offset;
}

// nudge is o moved by dx, dy, kept within the device's range.
export function nudge(o: Offset, dx: number, dy: number, s?: Settings | null): Offset {
  const clamp = (v: number, lo = -Infinity, hi = Infinity) => Math.min(hi, Math.max(lo, v));
  return {
    x: clamp(o.x + dx, s?.screen_offset_min?.x, s?.screen_offset_max?.x),
    y: clamp(o.y + dy, s?.screen_offset_min?.y, s?.screen_offset_max?.y),
  };
}

// offsetWords says where the picture is, e.g. "2 px right, 1 px up".
export function offsetWords(o: Offset): string {
  const w = [
    o.x && `${Math.abs(o.x)} px ${o.x > 0 ? "right" : "left"}`,
    o.y && `${Math.abs(o.y)} px ${o.y > 0 ? "down" : "up"}`,
  ].filter(Boolean);
  return w.length ? w.join(", ") : "Default position";
}
