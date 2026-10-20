// What the editor's components share: the config being edited, the
// connected device, its model and the device code.

import { getContext, setContext } from "svelte";
import type { Deck } from "./deck";
import type { Device } from "./device.svelte";
import type { Doc } from "./doc.svelte";
import type { Features } from "./features";
import type { Model } from "./models";

export interface App {
  doc: Doc;
  device: Device;
  deck: () => Deck | null; // null until it has loaded
  model: () => Model; // the connected device's, or the default
  // what to offer: what both the site and the device support, and for app
  // keys what the PC helper runs; null until the device code has loaded
  features: () => Features | null;
}

const key = Symbol("app");

export const setApp = (a: App) => setContext(key, a);
export const app = () => getContext<App>(key);
