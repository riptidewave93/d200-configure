// Where each key sits on the device's face, in screen pixels. It comes from
// d200-deck's render package (deck.layout), so it matches the device.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  width: number;
  height: number;
  keys: Rect[];
}
