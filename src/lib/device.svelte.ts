// The connected device: connecting and reconnecting, reading and saving its
// config, and what it says on its own (events).

import { Conn, DeviceError, type Progress, type Transport } from "./conn";
import { Event, Status, TimePeriod, Version, type ConfigInfo, type Hello, type HostInfo, type KeyEvent, type Settings } from "./proto";
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

// At most 10 brightness changes a second while a slider moves.
const brightnessGap = 100;

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
  private brightness = 0;
  private sendingBrightness = false;

  constructor() {
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
      if (hello.protocol < Version) throw new Error("This device's software is too old for this site. Update it first.");
      this.hello = hello;
      this.serial = hello.serial;
      if (this.hid) remember(hello.serial);
      await this.setClock();
      this.clock = window.setInterval(() => this.setClock(), TimePeriod);
      this.settings = await conn.settings();
      await this.checkHost();
      this.poll = window.setInterval(() => this.checkHost(), hostPoll);
      this.state = "ready";
    } catch (err) {
      await this.drop();
      this.error = message(err);
      return false;
    }
    this.onOpen?.();
    return true;
  }

  async disconnect() {
    await this.drop();
    this.hid = null;
    this.serial = "";
  }

  private async drop() {
    clearInterval(this.poll);
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

  // setBrightness sets the screen's brightness. It applies at once, so a
  // slider calls it as it moves: the device gets at most one change per
  // brightnessGap, and always the last.
  async setBrightness(percent: number) {
    this.brightness = percent;
    if (this.sendingBrightness) return;
    this.sendingBrightness = true;
    try {
      let sent = -1;
      while (sent !== this.brightness) {
        sent = this.brightness;
        this.settings = await this.connected().settings({ brightness: sent });
        await new Promise((r) => setTimeout(r, brightnessGap));
      }
    } finally {
      this.sendingBrightness = false;
    }
  }

  async identify(key: number) {
    await this.connected().identify(key);
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
