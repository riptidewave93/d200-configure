// The connected device: connecting and reconnecting, reading and saving its
// config, and what it says on its own (events).

import { Conn, DeviceError, type Progress, type Transport } from "./conn";
import { Event, Status, Version, type ConfigInfo, type Hello, type HostInfo, type KeyEvent, type Settings } from "./proto";
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

  onKey: ((e: KeyEvent) => void) | null = null;
  // called after each connect, including after a re-plug
  onOpen: (() => void) | null = null;
  // the config's version on the device, as we last read or saved it
  rev = "";

  private conn: Conn | null = null;
  private hid: HIDDevice | null = null;
  private serial = "";
  private poll = 0;

  constructor() {
    if (typeof navigator !== "undefined" && "hid" in navigator) {
      navigator.hid.addEventListener("connect", (e) => this.plugged(e.device));
      navigator.hid.addEventListener("disconnect", (e) => this.unplugged(e.device));
    }
  }

  // reconnect opens a device the user allowed before, if there is one.
  async reconnect() {
    const [d] = await known();
    if (d && this.state === "none") await this.open(d);
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

  // open connects to a HID device; for tests, a transport.
  async open(d: HIDDevice | Transport) {
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
      if (hello.protocol < Version) throw new Error("This device's software is too old for this site. Update it first.");
      this.hello = hello;
      this.serial = hello.serial;
      this.settings = await conn.settings();
      await this.checkHost();
      this.poll = window.setInterval(() => this.checkHost(), hostPoll);
      this.state = "ready";
    } catch (err) {
      await this.drop();
      this.error = message(err);
      return;
    }
    this.onOpen?.();
  }

  async disconnect() {
    await this.drop();
    this.hid = null;
    this.serial = "";
  }

  private async drop() {
    clearInterval(this.poll);
    const conn = this.conn;
    this.conn = null;
    this.state = "none";
    this.hello = this.host = this.settings = this.changed = null;
    this.progress = null;
    this.down = [];
    await conn?.close().catch(() => {});
  }

  private async plugged(d: HIDDevice) {
    if (this.state === "reconnecting" && d.collections.some((c) => c.usagePage === 0xffd2)) {
      const serial = this.serial;
      await this.open(d);
      if (this.hello && this.hello.serial !== serial) {
        this.error = "A different device connected.";
      }
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
    const info = await this.busy((conn, progress) => conn.writeConfig(force ? "" : this.rev, data, progress));
    this.rev = info.rev;
    this.changed = null;
  }

  // changeSettings changes device settings; most re-plug the device.
  async changeSettings(change: Settings) {
    this.settings = await this.connected().settings(change);
  }

  async identify(key: number) {
    await this.connected().identify(key);
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
