// Pictures from files, as key images and picture icons. The device's limits
// are tight, so a picture is fitted when it's added (deck.fitImage): scaled
// down to the size it's drawn at, and an animated GIF loses frames if it
// must. Saving drops the images no key uses.

import type { Config, Look } from "./config";
import type { AnimBudget, Deck, Fitted } from "./deck";

// The largest the device draws a picture icon (render: 120 px on the wide key).
export const iconSide = 120;

// A page's budget for animated GIFs on devices that don't report anim_bytes:
// 2 M pixels of frames as drawn, 4 bytes each (render.MaxAnimPixels). Past
// its budget, a GIF shows its first frame.
export const oldAnimBudget: AnimBudget = { bytes: 4 * (2 << 20), perPixel: 4 };

// animBudget is a page's budget for animated GIFs on a device with these
// limits: devices that report anim_bytes keep frames a byte a pixel.
export function animBudget(limits?: Record<string, number>): AnimBudget {
  const bytes = limits?.anim_bytes;
  return bytes ? { bytes, perPixel: 1 } : oldAnimBudget;
}

// Formats the device reads; others are turned into PNG here first.
const deviceTypes = ["image/png", "image/jpeg", "image/gif"];

// The largest picture handed on to be fitted, from formats the browser reads.
const maxConvertSide = 1024;

// readPicture gives a file's bytes as PNG, JPEG or GIF.
export async function readPicture(f: File): Promise<Uint8Array> {
  if (deviceTypes.includes(f.type)) return new Uint8Array(await f.arrayBuffer());
  let img: ImageBitmap;
  try {
    img = await createImageBitmap(f);
  } catch {
    throw new Error("That file isn't a picture.");
  }
  const s = Math.min(1, maxConvertSide / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * s));
  c.height = Math.max(1, Math.round(img.height * s));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
  if (!blob) throw new Error("That file isn't a picture.");
  return new Uint8Array(await blob.arrayBuffer());
}

// pictureID names a picture after its file, unlike any name in taken.
// IDs are letters, digits, "-", "_" and "."; up to 64.
export function pictureID(file: string, taken: Iterable<string>, prefix = ""): string {
  const base =
    prefix +
    (file
      .replace(/\.[^.]*$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "picture");
  const t = new Set(taken);
  let id = base;
  for (let n = 2; t.has(id); n++) id = `${base}-${n}`;
  return id;
}

// fitNote says what fitting changed, or "" if nothing did.
export function fitNote(f: Fitted): string {
  if (!f.changed) return "";
  const size = `${f.width}×${f.height}`;
  if (f.dropped) return `Made smaller to fit: ${size}, ${f.frames} of ${f.frames + f.dropped} frames.`;
  return `Made smaller to fit: ${size}.`;
}

// dataURL shows base64 picture data in an <img>.
export function dataURL(b64: string): string {
  const type = b64.startsWith("R0lGOD") ? "gif" : b64.startsWith("/9j/") ? "jpeg" : "png";
  return `data:image/${type};base64,${b64}`;
}

const looks = (c: Config): Look[] =>
  Object.values(c.pages).flatMap((p) => Object.values(p.keys).flatMap((b) => (b.on ? [b, b.on] : [b])));

// usedImages are the images some key shows.
export function usedImages(c: Config): Set<string> {
  return new Set(looks(c).flatMap((l) => (l.image ? [l.image] : [])));
}

const sizes = new Map<string, Map<string, number>>();

// bytes is what GIF data drawn to fit w x h takes of the budget; 0 if it's
// still.
function bytes(data: string, w: number, h: number, budget: AnimBudget, deck: Deck): number {
  if (!data.startsWith("R0lGOD")) return 0;
  let m = sizes.get(data);
  if (!m) sizes.set(data, (m = new Map()));
  const k = `${w}x${h}x${budget.perPixel}`;
  if (!m.has(k)) m.set(k, deck.animBytes(data, w, h, budget.perPixel));
  return m.get(k)!;
}

// lit is a key's look while on, as the device draws it (deck's lit).
function lit(b: Look, on: Look): Look {
  const l = { ...b };
  if (on.icon) [l.icon, l.image] = [on.icon, undefined];
  if (on.image) [l.image, l.icon] = [on.image, undefined];
  if (on.label) l.label = on.label;
  return l;
}

// animatedBytes sums what a page's animated GIFs take of the animation
// budget, each in the box the device draws it to fit (render.PictureBox).
// One picture at one size counts once. Without skip's picture: one about to
// be replaced.
export function animatedBytes(c: Config, deck: Deck, page: string, budget: AnimBudget, skip?: Look): number {
  const seen = new Map<string, number>();
  const bare = (l: Look): Look => (l === skip ? { ...l, image: undefined, icon: undefined } : l);
  for (const [n, b] of Object.entries(c.pages[page]?.keys ?? {})) {
    const base = bare(b);
    for (const l of b.on ? [base, lit(base, bare(b.on))] : [base]) {
      const label = !!l.label?.replace(/\n/g, " ");
      const [id, data] = l.image
        ? [l.image, c.images?.[l.image]]
        : l.icon && c.icons?.[l.icon]?.png
          ? [`\0${l.icon}`, c.icons[l.icon].png]
          : [];
      const box = data && deck.pictureBox(+n, !!l.image, label);
      if (box) seen.set(`${id}@${box[0]}x${box[1]}`, bytes(data!, box[0], box[1], budget, deck));
    }
  }
  let total = 0;
  for (const v of seen.values()) total += v;
  return total;
}

// share is the budget a GIF added to a page, drawn to fit w x h, gets:
// what the others leave, so they all move. With too little left for 2
// frames it gets 2, and the page warns it's over.
export function share(budget: AnimBudget, others: number, w: number, h: number): AnimBudget {
  const two = 2 * w * h * budget.perPixel + (budget.perPixel === 1 ? 4 * 256 : 0);
  return { ...budget, bytes: Math.max(budget.bytes - others, two) };
}
