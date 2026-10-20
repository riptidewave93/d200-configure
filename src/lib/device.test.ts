import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Device } from "./device.svelte";
import { FakeDevice } from "./fakedevice";
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
