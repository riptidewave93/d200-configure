// Pictures from files, as key images and picture icons. The device's limits
// are tight, so a picture is fitted when it's added (deck.fitImage): scaled
// down to the size it's drawn at, and an animated GIF loses frames if it
// must. Saving drops the images no key uses.

import type { Config, Look } from "./config";
import type { Deck, Fitted } from "./deck";

// The largest the device draws a picture icon (render: 120 px on the wide key).
export const iconSide = 120;

// What the device animates on a page, in frame pixels at the size it draws
// them (render.MaxAnimPixels); past it, a GIF shows its first frame.
export const maxAnimPixels = 2 << 20;

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

const infos = new Map<string, { width: number; height: number; frames: number } | null>();

// animatedPixels estimates the frame pixels the device keeps to animate a
// page's GIFs, each scaled to where it's shown: images to their key,
// picture icons to icon size. One picture shown at one size counts once.
export function animatedPixels(c: Config, deck: Deck, page: string): number {
  const seen = new Map<string, number>();
  const count = (id: string, data: string | undefined, w: number, h: number) => {
    if (!data?.startsWith("R0lGOD")) return;
    const k = `${id}:${data.length}`;
    if (!infos.has(k)) infos.set(k, deck.imageInfo(data));
    const i = infos.get(k);
    if (!i || i.frames < 2) return;
    const s = Math.min(w / i.width, h / i.height);
    seen.set(`${id}@${w}x${h}`, i.frames * Math.round(i.width * s) * Math.round(i.height * s));
  };
  for (const p of [c.pages[page]].filter(Boolean)) {
    for (const [n, b] of Object.entries(p.keys)) {
      const k = deck.layout.keys[+n];
      if (!k) continue;
      for (const l of b.on ? [b, b.on] : [b]) {
        if (l.image) count(`image:${l.image}`, c.images?.[l.image], k.w, k.h);
        else if (l.icon) count(`icon:${l.icon}`, c.icons?.[l.icon]?.png, iconSide, iconSide);
      }
    }
  }
  let total = 0;
  for (const v of seen.values()) total += v;
  return total;
}
