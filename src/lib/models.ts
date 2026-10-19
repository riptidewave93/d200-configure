// The kinds of device the site knows: their keys and what their face looks
// like. Everything is in screen pixels, the units the device draws keys in,
// so key pictures, key caps and the body line up.

import type { Hello } from "./proto";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Model {
  id: string; // as the device names itself in hello
  name: string; // for docs and logs; the page says "device"
  // where each key's picture shows on the screen, numbered as in the config
  windows: Rect[];
  // how far a key cap reaches past its picture, and its corner radius
  cap: { out: number; radius: number };
  // the body: how far it reaches past the outer key caps on each side, its
  // corner radius, and its colour
  body: { left: number; top: number; right: number; bottom: number; radius: number; colour: string };
}

// D200: a 1280x720 screen behind 14 keys, the last one wide. The windows
// are d200-deck's render.Key (a test checks they match); the caps and body
// are measured from photos.
const d200Windows: Rect[] = [
  ...Array.from({ length: 13 }, (_, i) => ({
    x: [16, 275, 534, 793, 1052][i % 5],
    y: [1, 262, 524][Math.floor(i / 5)],
    w: 196,
    h: 196,
  })),
  { x: 793, y: 523, w: 458, h: 196 },
];

export const models: Model[] = [
  {
    id: "ulanzi,d200",
    name: "Ulanzi D200",
    windows: d200Windows,
    cap: { out: 5, radius: 20 },
    // black in real life; a little lighter here, so it stands out on a dark page
    body: { left: 181, top: 145, right: 181, bottom: 99, radius: 40, colour: "#2a2c2f" },
  },
];

// modelFor picks the model of a connected device: by the model it reports,
// else by its number of keys, else the first. With no device, the first.
export function modelFor(hello?: Hello | null): Model {
  if (hello) {
    const byID = models.find((m) => m.id === hello.model);
    if (byID) return byID;
    const byKeys = models.find((m) => m.windows.length === hello.keys);
    if (byKeys) return byKeys;
  }
  return models[0];
}

// Face geometry, worked out from a model.

export interface Face {
  width: number;
  height: number;
  radius: number;
  colour: string;
  keys: { cap: Rect; window: Rect }[]; // window: the picture, inside the cap
}

export function face(m: Model): Face {
  const { body, cap } = m;
  const caps = m.windows.map((r) => ({ x: r.x - cap.out, y: r.y - cap.out, w: r.w + 2 * cap.out, h: r.h + 2 * cap.out }));
  const minX = Math.min(...caps.map((c) => c.x));
  const minY = Math.min(...caps.map((c) => c.y));
  const maxX = Math.max(...caps.map((c) => c.x + c.w));
  const maxY = Math.max(...caps.map((c) => c.y + c.h));
  return {
    width: body.left + (maxX - minX) + body.right,
    height: body.top + (maxY - minY) + body.bottom,
    radius: body.radius,
    colour: body.colour,
    keys: caps.map((c) => ({
      cap: { ...c, x: body.left + c.x - minX, y: body.top + c.y - minY },
      window: { x: cap.out, y: cap.out, w: c.w - 2 * cap.out, h: c.h - 2 * cap.out },
    })),
  };
}
