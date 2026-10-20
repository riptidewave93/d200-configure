import { describe, expect, it } from "vitest";
import { explain } from "./errors";

describe("explain", () => {
  it("names the key and says what to do", () => {
    expect(explain('page "main" key 12: hid-consumer needs a usage')).toEqual({
      text: "Key 13 on main: pick a media key.",
      page: "main",
      key: 12,
    });
    expect(explain('page "main" key 0: hid-key needs keys').text).toBe("Key 1 on main: record a key combo.");
    expect(explain('page "main" key 0: open-url needs an http(s) url').text).toBe("Key 1 on main: add a web address.");
    expect(explain('page "main" key 0: launch needs a command').text).toBe("Key 1 on main: add a program.");
    expect(explain('page "main" key 0: page "" does not exist').text).toBe("Key 1 on main: pick a page.");
  });

  it("explains steps, fallbacks and looks while on", () => {
    expect(explain('page "a b" key 3: step 1: hid-key needs keys').text).toBe("Key 4 on a b: step 2: record a key combo.");
    expect(explain('page "x" key 0: fallback: hid-consumer needs a usage').text).toBe(
      "Key 1 on x: without the PC helper: pick a media key.",
    );
    expect(explain('page "x" key 0: on: label longer than 32 characters').text).toBe(
      "Key 1 on x: look while on: a label takes up to 32 characters.",
    );
  });

  it("names the key of an unknown field", () => {
    expect(explain("pages.main.keys.0.glow: unknown field; it needs newer device software")).toEqual({
      text: 'Key 1 on main: "glow" needs newer device software.',
      page: "main",
      key: 0,
    });
  });

  it("keeps other reasons as they are", () => {
    expect(explain('home page "x" does not exist').text).toBe('home page "x" does not exist.');
    expect(explain('Page "main" key 0: something new').text).toBe("Key 1 on main: something new.");
  });
});
