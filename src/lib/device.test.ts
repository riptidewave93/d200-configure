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
