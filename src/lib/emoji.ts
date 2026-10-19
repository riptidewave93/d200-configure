// Emoji as key icons. The device has no emoji font, so a picked emoji is
// drawn here, with this computer's emoji font, into a small PNG that goes in
// the config. One PNG per emoji, however many keys use it.
//
// Names and search words come from emojibase (MIT), loaded only when the
// emoji picker opens.

export interface Emoji {
  char: string;
  hex: string; // code points, e.g. "1F3AE"
  name: string;
  tags: string[];
}

interface Entry {
  hexcode: string;
  label: string;
  unicode: string;
  tags?: string[];
  group?: number;
  order?: number;
}

// emojibase's group for skin tones and other parts of emoji, not emoji to pick
const componentGroup = 2;

let list: Promise<Emoji[]> | null = null;

// emojis loads the list, in Unicode's order.
export function emojis(): Promise<Emoji[]> {
  list ??= import("emojibase-data/en/compact.json").then((m) =>
    (m.default as Entry[])
      .filter((e) => e.group !== undefined && e.group !== componentGroup)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((e) => ({ char: e.unicode, hex: e.hexcode, name: e.label, tags: e.tags ?? [] })),
  );
  return list;
}

// search finds emoji by name or search word: names that start with the
// words first.
export function search(all: Emoji[], q: string): Emoji[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return all;
  const hits = all.filter((e) =>
    words.every((w) => e.name.toLowerCase().includes(w) || e.tags.some((t) => t.startsWith(w))),
  );
  const rank = (e: Emoji) => (e.name.toLowerCase().startsWith(words[0]) ? 0 : 1);
  return hits.sort((a, b) => rank(a) - rank(b));
}

// emojiID is the icon name an emoji is kept under in the config.
export const emojiID = (hex: string) => `emoji-${hex.toLowerCase()}`;

// emojiChar is the emoji an icon name stands for, or "" if it isn't one.
export function emojiChar(id = ""): string {
  const m = id.match(/^emoji-([0-9a-f]+(?:-[0-9a-f]+)*)$/);
  return m ? String.fromCodePoint(...m[1].split("-").map((h) => parseInt(h, 16))) : "";
}

// The largest the device draws an icon (render: 120 px on the wide key).
export const emojiSize = 120;

const fonts = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// emojiPNG draws an emoji, fitted and centred in a transparent square, as
// base64 PNG.
export async function emojiPNG(char: string, size = emojiSize): Promise<string> {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  // measure at a large size, then scale so the drawn shape fills the square
  const probe = 200;
  ctx.font = `${probe}px ${fonts}`;
  const m = ctx.measureText(char);
  const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const scale = (size * 0.96) / Math.max(w, h, 1);
  ctx.font = `${probe * scale}px ${fonts}`;
  ctx.textBaseline = "alphabetic";
  const x = size / 2 - ((m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2) * scale;
  const y = size / 2 + ((m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2) * scale;
  ctx.fillText(char, x, y);
  const blob = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("no PNG"))), "image/png"));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
