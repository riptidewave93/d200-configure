// The connected device: connecting and reconnecting, reading and saving its
// config, and what it says on its own (events).

import { Conn, DeviceError, TooOld, type Progress, type Transport } from "./conn";
import {
  Event,
  Status,
  TimePeriod,
  MinVersion,
  Version,
  type ConfigInfo,
  type Hello,
  type HostInfo,
  type KeyEvent,
  type Offset,
  type Settings,
} from "./proto";
import { browserOS, hostOS, type OS } from "./mac";
import { HIDTransport, known, pick } from "./webhid";

export type State =
  | "none" // no device
  | "connecting"
  | "ready"
  | "busy" // reading or saving the config
  | "reconnecting"; // the device re-plugs, e.g. after a settings change

const text = new TextDecoder();

// How often to ask whether the PC helper is running: nothing tells us.
const hostPoll = 5000;

// At most 10 changes a second while a slider moves or a button is pressed.
const changeGap = 100;
// While the site is open and visible, device keys only select keys here:
// the device holds their actions while told so, and stops a while after
// the last time it was told, so it's told again often.
const editingRefresh = 3_000;
// A device restarting after a reset is back in about 35 s.
const restartWait = 90_000;
// The alignment pattern ends by itself a minute after the last change, so
// it's sent again while it shows.
const patternRefresh = 20_000;

// The serial number of the device used last, so that with several allowed
// the site goes back to the same one. Only in this browser.
const lastKey = "last-device";

function remembered(): string {
  try {
    return localStorage.getItem(lastKey) ?? "";
  } catch {
    return "";
  }
}

function remember(serial: string) {
  try {
    localStorage.setItem(lastKey, serial);
  } catch {
    // private windows may refuse; then it's the first allowed device
  }
}

export class Device {
  state = $state<State>("none");
  hello = $state<Hello | null>(null);
  host = $state<HostInfo | null>(null);
  settings = $state<Settings | null>(null);
  error = $state("");
  progress = $state<{ done: number; total: number } | null>(null);
  // set when someone else saved a config since we read ours
  changed = $state<ConfigInfo | null>(null);
  // keys held down on the device right now
  down = $state<number[]>([]);
  // the button to press on the device while it asks about a change, else ""
  asking = $state("");

  onKey: ((e: KeyEvent) => void) | null = null;
  // called after each connect, including after a re-plug
  onOpen: (() => void) | null = null;
  // the config's version on the device, as we last read or saved it
  rev = "";

  private conn: Conn | null = null;
  private hid: HIDDevice | null = null;
  private serial = "";
  private poll = 0;
  private clock = 0;
  // the computer the site runs on, which the device is plugged into
  os: OS = browserOS();
  private brightnessSender = latest((brightness: number) => this.change({ brightness }));
  private offsetSender = latest((screen_offset: Offset) => this.change({ screen_offset }));
  private pattern = 0;
  private editing = 0;

  constructor() {
    // a closed tab ends the alignment pattern and editing, if it can
    globalThis.addEventListener?.("pagehide", () => {
      if (this.pattern) this.showPattern(false).catch(() => {});
      this.holdKeys(false);
    });
    // device keys run their actions again while the site isn't seen
    globalThis.document?.addEventListener("visibilitychange", () => this.holdKeys(visible()));
    if (typeof navigator !== "undefined" && "hid" in navigator) {
      navigator.hid.addEventListener("connect", (e) => this.plugged(e.device));
      navigator.hid.addEventListener("disconnect", (e) => this.unplugged(e.device));
    }
  }

  // reconnect opens a device the user allowed before, if there is one: the
  // one used last, else the first. A HID device doesn't say its serial
  // number until it's opened, so each is opened to ask.
  async reconnect() {
    const all = await known();
    const last = remembered();
    if (last && all.length > 1) {
      for (const d of all) {
        if (this.state !== "none") return;
        if (await this.open(d, last)) return;
      }
    }
    if (all[0] && this.state === "none") await this.open(all[0]);
  }

  // choose asks the user for a device and opens it.
  async choose() {
    this.error = "";
    let d;
    try {
      d = await pick();
    } catch (err) {
      this.error = message(err);
    }
    if (d) await this.open(d);
  }

  // open connects to a HID device; for tests, a transport. With want, only
  // to the device with that serial number: another is closed again, leaving
  // the state as it was. It says whether it connected.
  async open(d: HIDDevice | Transport, want = ""): Promise<boolean> {
    const before = this.state === "reconnecting" ? "reconnecting" : "none";
    await this.drop();
    this.state = "connecting";
    this.error = "";
    try {
      let t: Transport;
      if ("collections" in d) {
        this.hid = d;
        t = await HIDTransport.open(d);
      } else {
        t = d;
      }
      const conn = new Conn(t);
      this.conn = conn;
      conn.onEvent((code, p) => this.event(code, p));
      const hello = await conn.hello();
      if (want && hello.serial !== want) {
        await this.drop();
        this.hid = null;
        this.state = before;
        return false;
      }
      if (hello.protocol < MinVersion) throw new Error(TooOld);
      if (hello.protocol > Version) throw new Error("This device's software is newer than this site. Reload the page.");
      this.hello = hello;
      this.serial = hello.serial;
      if (this.hid) remember(hello.serial);
      await this.setClock();
      this.clock = window.setInterval(() => this.setClock(), TimePeriod);
      this.settings = await conn.settings();
      await this.checkHost();
      // tell the device which computer this is, unless the PC helper has
      const os = hostOS(this.os, hello.features, this.settings, this.host);
      if (os) this.settings = await conn.settings({ host_os: os }).catch(() => this.settings);
      this.poll = window.setInterval(() => this.checkHost().catch(() => {}), hostPoll);
      this.state = "ready";
      this.holdKeys(visible());
    } catch (err) {
      await this.drop();
      this.error = message(err);
      return false;
    }
    this.onOpen?.();
    return true;
  }

  async disconnect() {
    await this.holdKeys(false);
    await this.drop();
    this.hid = null;
    this.serial = "";
  }

  private async drop() {
    clearInterval(this.poll);
    clearInterval(this.editing);
    this.editing = 0;
    clearInterval(this.pattern);
    clearInterval(this.clock);
    const conn = this.conn;
    this.conn = null;
    this.state = "none";
    this.hello = this.host = this.settings = this.changed = null;
    this.progress = null;
    this.down = [];
    await conn?.close().catch(() => {});
  }

  // plugged reconnects after a re-plug, to the same device only: another
  // one plugged in meanwhile is passed over.
  private async plugged(d: HIDDevice) {
    if (this.state !== "reconnecting" || !d.collections.some((c) => c.usagePage === 0xffd2)) return;
    if (await this.open(d, this.serial)) return;
    // the one we wait for may have come back while we asked the other
    for (const other of await known()) {
      if (other === d || this.state !== "reconnecting") continue;
      if (await this.open(other, this.serial)) return;
    }
  }

  private unplugged(d: HIDDevice) {
    if (d !== this.hid) return;
    const rebinding = this.state === "reconnecting";
    this.drop();
    if (rebinding) this.state = "reconnecting";
    else this.serial = "";
  }

  private event(code: number, p: Uint8Array) {
    switch (code) {
      case Event.USBRebinding:
        clearInterval(this.poll);
        clearInterval(this.clock);
        clearInterval(this.editing);
        this.state = "reconnecting";
        break;
      case Event.ConfigChanged: {
        const info = JSON.parse(text.decode(p)) as ConfigInfo;
        if (info.rev !== this.rev) this.changed = info;
        break;
      }
      case Event.Key: {
        const e = JSON.parse(text.decode(p)) as KeyEvent;
        this.down = e.release ? this.down.filter((k) => k !== e.key) : [...this.down, e.key];
        this.onKey?.(e);
        break;
      }
    }
  }

  // setClock sends the device the time. The PC helper does too, so this
  // matters only without it. Nothing depends on it: an older device doesn't
  // know the command, and a device refuses a time before its software was
  // built, so errors are ignored.
  private async setClock() {
    await this.conn?.time().catch(() => {});
  }

  private async checkHost() {
    try {
      this.host = (await this.conn?.host()) ?? null;
    } catch (err) {
      // a device without the host command
      if (!(err instanceof DeviceError && err.status === Status.UnknownCmd)) throw err;
      this.host = null;
    }
  }

  private connected(): Conn {
    if (!this.conn) throw new Error("No device is connected.");
    return this.conn;
  }

  private async busy<T>(f: (conn: Conn, progress: Progress) => Promise<T>): Promise<T> {
    const conn = this.connected();
    this.state = "busy";
    this.progress = { done: 0, total: 0 };
    try {
      return await f(conn, (done, total) => (this.progress = { done, total }));
    } catch (err) {
      if (err instanceof DeviceError && err.status === Status.UnknownCmd) {
        throw new Error("This device's software is too old for this site. Update it first.");
      }
      throw err;
    } finally {
      this.progress = null;
      if (this.conn === conn) this.state = "ready";
    }
  }

  configInfo(): Promise<ConfigInfo> {
    return this.connected().configInfo();
  }

  // readConfig reads the device's config file.
  async readConfig(): Promise<Uint8Array> {
    const { data, info } = await this.busy((conn, progress) => conn.readConfig(progress));
    this.rev = info.rev;
    this.changed = null;
    return data;
  }

  // saveConfig replaces the device's config, if no one changed it since we
  // read it (force replaces it anyway).
  async saveConfig(data: Uint8Array, force = false) {
    const info = await this.busy((conn, progress) =>
      conn.writeConfig(force ? "" : this.rev, data, progress, () => (this.asking = "Save")).finally(
        () => (this.asking = ""),
      ),
    );
    this.rev = info.rev;
    this.changed = null;
  }

  // changeSettings changes device settings; they re-plug the device, and
  // the device asks before a new USB network address.
  async changeSettings(change: Settings) {
    try {
      this.settings = await this.connected().settings(change, () => (this.asking = "Change"));
    } finally {
      this.asking = "";
    }
  }

  private async change(s: Settings) {
    this.settings = await this.connected().settings(s);
  }

  // setBrightness sets the screen's brightness. It applies at once, so a
  // slider calls it as it moves (see latest).
  setBrightness(percent: number) {
    return this.brightnessSender(percent);
  }

  // setOffset moves the picture on the screen; the device keeps it within
  // its range.
  setOffset(o: Offset) {
    return this.offsetSender(o);
  }

  // showPattern shows the alignment pattern on the device, or ends it.
  async showPattern(on: boolean) {
    clearInterval(this.pattern);
    this.pattern = 0;
    if (on) this.pattern = window.setInterval(() => this.change({ screen_pattern: true }).catch(() => {}), patternRefresh);
    await this.change({ screen_pattern: on });
  }

  async identify(key: number) {
    await this.connected().identify(key);
  }

  // holdKeys tells a device that takes it to hold its keys' actions, so a
  // press only selects the key here, or to run them again. Errors are
  // ignored: at worst a key runs its action, as on older devices.
  async holdKeys(on: boolean) {
    const takes = !!this.hello?.features?.settings?.includes("editing");
    if (!this.conn || !takes || (!on && !this.editing && !this.settings?.editing)) return;
    clearInterval(this.editing);
    this.editing = on ? window.setInterval(() => this.change({ editing: true }).catch(() => {}), editingRefresh) : 0;
    await this.change({ editing: on }).catch(() => {});
  }

  // reset erases the device's keys and settings, once confirmed on it; it
  // then restarts, and is reconnected when it's back.
  async reset() {
    try {
      await this.connected().reset(() => (this.asking = "Erase"));
    } finally {
      this.asking = "";
    }
    clearInterval(this.poll);
    clearInterval(this.clock);
    clearInterval(this.pattern);
    clearInterval(this.editing);
    this.state = "reconnecting";
    setTimeout(() => {
      if (this.state !== "reconnecting") return;
      this.disconnect();
      this.error = "The device didn't come back after restarting. Plug it in again, then connect.";
    }, restartWait);
  }

  // flash flashes the whole screen, to tell devices apart.
  async flash() {
    try {
      await this.connected().flash();
    } catch (err) {
      if (err instanceof DeviceError && err.status !== Status.Failed) {
        throw new Error("This device's software can't flash its screen yet. Update it first.");
      }
      throw err;
    }
  }

  // pageURL is a link to one of the device's web pages, e.g. "/update".
  pageURL(path: string): string | null {
    return this.hello?.ipv4 ? `http://${this.hello.ipv4}${path}` : null;
  }
}

export function message(err: unknown): string {
  const s = err instanceof Error ? err.message : String(err);
  // the device's reasons start lower case, as Go errors do
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// visible says whether the page is seen; without a document (tests), it is.
const visible = () => globalThis.document?.visibilityState !== "hidden";

// latest sends values as they come, at most one per changeGap, always the
// last: a slider or a held button sends many.
function latest<T>(send: (v: T) => Promise<void>): (v: T) => Promise<void> {
  let want: T;
  let busy = false;
  return async (v: T) => {
    want = v;
    if (busy) return;
    busy = true;
    try {
      let sent: string | undefined;
      while (sent !== JSON.stringify(want)) {
        sent = JSON.stringify(want);
        await send(want);
        await new Promise((r) => setTimeout(r, changeGap));
      }
    } finally {
      busy = false;
    }
  };
}
