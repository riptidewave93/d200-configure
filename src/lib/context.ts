// What the editor's components share: the config being edited, the
// connected device, its model and the device code.

import { getContext, setContext } from "svelte";
import type { Deck } from "./deck";
import type { Device } from "./device.svelte";
import type { Doc } from "./doc.svelte";
import type { Model } from "./models";

export interface App {
  doc: Doc;
  device: Device;
  deck: () => Deck | null; // null until it has loaded
  model: () => Model; // the connected device's, or the default
}

const key = Symbol("app");

export const setApp = (a: App) => setContext(key, a);
export const app = () => getContext<App>(key);
