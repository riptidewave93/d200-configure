// What the editor's components share: the config being edited, the
// connected device and the config checker.

import { getContext, setContext } from "svelte";
import type { Deck } from "./deck";
import type { Device } from "./device.svelte";
import type { Doc } from "./doc.svelte";

export interface App {
  doc: Doc;
  device: Device;
  deck: () => Deck | null; // null until it has loaded
}

const key = Symbol("app");

export const setApp = (a: App) => setContext(key, a);
export const app = () => getContext<App>(key);
