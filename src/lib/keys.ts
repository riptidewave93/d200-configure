// Key combos: the device's key names (docs/config.md) for the browser's
// KeyboardEvent.code, so a combo can be recorded by pressing it.

const codes: Record<string, string> = {
  Enter: "enter",
  NumpadEnter: "enter",
  Escape: "esc",
  Backspace: "backspace",
  Tab: "tab",
  Space: "space",
  Minus: "minus",
  Equal: "equal",
  BracketLeft: "leftbrace",
  BracketRight: "rightbrace",
  Backslash: "backslash",
  Semicolon: "semicolon",
  Quote: "apostrophe",
  Backquote: "grave",
  Comma: "comma",
  Period: "dot",
  Slash: "slash",
  CapsLock: "capslock",
  PrintScreen: "printscreen",
  ScrollLock: "scrolllock",
  Pause: "pause",
  Insert: "insert",
  Home: "home",
  PageUp: "pageup",
  Delete: "delete",
  End: "end",
  PageDown: "pagedown",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ContextMenu: "menu",
  ControlLeft: "ctrl",
  ShiftLeft: "shift",
  AltLeft: "alt",
  MetaLeft: "gui",
  ControlRight: "rctrl",
  ShiftRight: "rshift",
  AltRight: "ralt",
  MetaRight: "rgui",
};

export const modifiers = ["ctrl", "shift", "alt", "gui", "rctrl", "rshift", "ralt", "rgui"];

// keyName is the device's name for a key the browser saw, or "".
export function keyName(code: string): string {
  if (code in codes) return codes[code];
  let m = code.match(/^Key([A-Z])$/) ?? code.match(/^(?:Digit|Numpad)([0-9])$/);
  if (m) return m[1].toLowerCase();
  m = code.match(/^F([0-9]{1,2})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 24) return `f${m[1]}`;
  return "";
}

// ordered puts modifiers first, as people write combos.
export function ordered(keys: string[]): string[] {
  const mods = modifiers.filter((m) => keys.includes(m));
  return [...mods, ...keys.filter((k) => !modifiers.includes(k))];
}

export const formatCombo = (keys: string[] = []) => keys.join(" + ");

export function parseCombo(s: string): string[] {
  return s
    .split("+")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}
