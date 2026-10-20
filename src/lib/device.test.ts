import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Device } from "./device.svelte";
import { FakeDevice } from "./fakedevice";
import type { Features } from "./features";
import { Cmd, TimePeriod } from "./proto";

describe("device", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    // only the timers Device repeats on: replies still come at once
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sets the clock on connecting, then every hour", async () => {
    const fake = new FakeDevice();
    const d = new Device();
    await d.open(fake);
    expect(d.state).toBe("ready");
    expect(fake.times).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(TimePeriod);
    await vi.waitFor(() => expect(fake.times).toHaveLength(2));
    await d.disconnect();
    await vi.advanceTimersByTimeAsync(TimePeriod);
    expect(fake.times).toHaveLength(2);
  });

  it("connects only to the device it waits for, when asked", async () => {
    const other = new FakeDevice();
    other.hello.serial = "fedcba9876543210";
    const d = new Device();
    expect(await d.open(other, "0123456789abcdef")).toBe(false);
    expect(d.state).toBe("none");
    expect(d.hello).toBeNull();
    expect(await d.open(new FakeDevice(), "0123456789abcdef")).toBe(true);
    expect(d.state).toBe("ready");
    await d.disconnect();
  });

  it("flashes the screen, or says the device is too old to", async () => {
    const fake = new FakeDevice();
    const d = new Device();
    await d.open(fake);
    await d.flash();
    expect(fake.identified).toEqual([-1]);
    fake.canFlash = false;
    await expect(d.flash()).rejects.toThrow("can't flash its screen yet");
    await d.disconnect();
  });

  it("sends brightness as a slider moves: not every step, but always the last", async () => {
    const fake = new FakeDevice();
    const d = new Device();
    await d.open(fake);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const done = [20, 30, 40, 50].map((p) => d.setBrightness(p));
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(done);
    expect(fake.settingsChanges).toEqual([{ brightness: 20 }, { brightness: 50 }]);
    expect(d.settings?.brightness).toBe(50);
    await d.disconnect();
  });

  it("sets what the screen does while the computer sleeps, where the device has it", async () => {
    const fake = new FakeDevice();
    const d = new Device();
    await d.open(fake);
    expect(d.settings?.sleep_screen).toBe("zzz");
    await d.changeSettings({ sleep_screen: "off" });
    expect(fake.settingsChanges).toEqual([{ sleep_screen: "off" }]);
    expect(d.settings?.sleep_screen).toBe("off");
    expect(d.state).toBe("ready"); // no reconnecting, unlike USB settings
    await expect(d.changeSettings({ sleep_screen: "dark" as "off" })).rejects.toThrow('sleep_screen must be "zzz" or "off"');
    await d.disconnect();

    // older software, or a screen that can't dim, doesn't say: nothing to show
    const old = new FakeDevice();
    delete old.settingsState.sleep_screen;
    await d.open(old);
    expect(d.settings).not.toHaveProperty("sleep_screen");
    await d.disconnect();
  });

  it("tells a device that takes it which computer this is, on connecting", async () => {
    const fake = () => {
      const f = new FakeDevice();
      f.hello.features = { settings: ["brightness", "host_os"] } as Features;
      f.settingsState.host_os = "other";
      return f;
    };
    const d = new Device();
    d.os = "mac";
    const mac = fake();
    await d.open(mac);
    expect(mac.settingsChanges).toEqual([{ host_os: "mac" }]);
    expect(d.settings?.host_os).toBe("mac");
    await d.disconnect();

    // already right, or the PC helper is connected and says itself: nothing written
    const same = fake();
    same.settingsState.host_os = "mac";
    await d.open(same);
    const helper = fake();
    helper.host = { connected: true };
    await d.disconnect();
    await d.open(helper);
    await d.disconnect();
    expect([same.settingsChanges, helper.settingsChanges]).toEqual([[], []]);

    // older software doesn't take it
    const old = new FakeDevice();
    await d.open(old);
    expect(old.settingsChanges).toEqual([]);
    await d.disconnect();
  });

  it("moves the picture, sending the last of quick changes, and the device keeps it in range", async () => {
    const fake = new FakeDevice();
    const d = new Device();
    await d.open(fake);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const done = [1, 2, 3].map((x) => d.setOffset({ x, y: 0 }));
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(done);
    expect(fake.settingsChanges).toEqual([{ screen_offset: { x: 1, y: 0 } }, { screen_offset: { x: 3, y: 0 } }]);
    const far = d.setOffset({ x: 99, y: -99 });
    await vi.advanceTimersByTimeAsync(200);
    await far;
    expect(d.settings?.screen_offset).toEqual({ x: 31, y: -3 });
    await d.disconnect();
  });

  it("keeps the alignment pattern up while it shows, and ends it", async () => {
    const fake = new FakeDevice();
    const d = new Device();
    await d.open(fake);
    // fake intervals; the fake device answers in real time
    const wait = async (ms: number) => {
      for (let t = 0; t < ms; t += 5000) {
        await vi.advanceTimersByTimeAsync(5000);
        await new Promise((r) => setTimeout(r, 5));
      }
    };
    await d.showPattern(true);
    expect(d.settings?.screen_pattern).toBe(true);
    await wait(45_000); // sent again every 20 s: the device ends it after 60 s
    expect(fake.settingsChanges).toEqual([{ screen_pattern: true }, { screen_pattern: true }, { screen_pattern: true }]);
    await d.showPattern(false);
    await wait(60_000);
    expect(fake.settingsChanges.at(-1)).toEqual({ screen_pattern: false });
    expect(fake.settingsChanges).toHaveLength(4);
    // a disconnect stops sending it too
    await d.showPattern(true);
    await d.disconnect();
    await wait(60_000);
    expect(fake.settingsChanges).toHaveLength(5);
  });

  it("resets a device once it's confirmed there, then waits for its restart", async () => {
    const fake = new FakeDevice();
    fake.ask = { delay: 1500, yes: true };
    const d = new Device();
    await d.open(fake);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const done = d.reset();
    await vi.advanceTimersByTimeAsync(1200);
    expect(d.asking).toBe("Erase");
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect([fake.resets, d.asking, d.state]).toEqual([1, "", "reconnecting"]);
    // not back after 90 s: stop waiting, and say so
    await vi.advanceTimersByTimeAsync(90_000);
    expect(d.state).toBe("none");
    expect(d.error).toBe("The device didn't come back after restarting. Plug it in again, then connect.");
  });

  it("leaves the device as it was when the reset isn't confirmed, or it can't reset", async () => {
    const fake = new FakeDevice();
    fake.ask = { delay: 0, yes: false };
    const d = new Device();
    await d.open(fake);
    await expect(d.reset()).rejects.toThrow("cancelled on the device");
    expect([fake.resets, d.state]).toEqual([0, "ready"]);
    await d.disconnect();

    const old = new FakeDevice();
    old.unknown.add(Cmd.Reset);
    await d.open(old);
    await expect(d.reset()).rejects.toThrow();
    expect([old.resets, d.state]).toEqual([0, "ready"]);
    await d.disconnect();
  });

  it("says when a device's software is newer than the site", async () => {
    const newer = new FakeDevice();
    newer.hello.protocol = 5;
    const d = new Device();
    await d.open(newer);
    expect(d.state).toBe("none");
    expect(d.error).toBe("This device's software is newer than this site. Reload the page.");
  });

  it("connects to a device that can't take the time", async () => {
    const older = new FakeDevice();
    older.unknown.add(Cmd.Time);
    const d = new Device();
    await d.open(older);
    expect(d.state).toBe("ready");

    const behind = new FakeDevice();
    behind.built = Date.now() + 1e9;
    await d.open(behind);
    expect(d.state).toBe("ready");
    expect(d.error).toBe("");
    await d.disconnect();
  });
});
