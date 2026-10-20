// Why a config can't be saved, from d200-deck's checks, in plain words.

export interface Problem {
  text: string;
  page?: string; // the key it's about, to select it
  key?: number;
}

// What to do, for each of d200-deck's reasons (deck.Validate, ParseStrict).
const fixes: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/^hid-consumer needs a usage|^unknown usage/, "pick a media key"],
  [/^hid-system needs a system control|^unknown system control/, "pick sleep or power off"],
  [/^hid-key needs keys|^unknown key/, "record a key combo"],
  [/^more than (\d+) keys/, (m) => `a combo takes up to ${m[1]} keys`],
  [/^page ".*" does not exist/, "pick a page"],
  [/^(open-url|http) needs an http\(s\) url/, "add a web address"],
  [/^launch needs a command/, "add a program"],
  [/^type-text longer than (\d+)/, (m) => `the text takes up to ${m[1]} characters`],
  [/^type-text can't type/, "the text has characters the device can't type"],
  [/^macro has more than (\d+) steps/, (m) => `a macro takes up to ${m[1]} steps`],
  [/^delay needs ms \(1-(\d+)\)/, (m) => `a wait takes 1 to ${m[1]} ms`],
  [/^app needs an app and an op/, "pick an app action"],
  [/^label longer than (\d+)/, (m) => `a label takes up to ${m[1]} characters`],
  [/^label has more than (\d+) lines/, (m) => `a label takes up to ${m[1]} lines`],
  [/^icon and image are both set/, "pick an icon or an image, not both"],
  [/^font ".*" does not exist/, "pick a font"],
  [/^image ".*" does not exist/, "pick an image"],
  [/^only on hid-key/, "only key combos have one"],
];

function fix(why: string): string {
  const step = why.match(/^step (\d+): (.*)$/);
  if (step) return `step ${Number(step[1]) + 1}: ${fix(step[2])}`;
  const fallback = why.match(/^fallback: (.*)$/);
  if (fallback) return `without the PC helper: ${fix(fallback[1])}`;
  const on = why.match(/^on: (.*)$/);
  if (on) return `look while on: ${fix(on[1])}`;
  const mac = why.match(/^mac_keys: (.*)$/);
  if (mac) return `on a Mac: ${fix(mac[1])}`;
  for (const [re, words] of fixes) {
    const m = why.match(re);
    if (m) return typeof words === "string" ? words : words(m);
  }
  return why;
}

// explain turns a reason from the device code into a sentence, naming the
// key it's about (counted from 1, as on the page).
export function explain(why: string): Problem {
  const k = why.match(/^page "(.*?)" key (\d+): (.*)$/i);
  if (k) {
    const key = Number(k[2]);
    return { text: `Key ${key + 1} on ${k[1]}: ${fix(k[3])}.`, page: k[1], key };
  }
  const field = why.match(/^pages\.(.+)\.keys\.(\d+)\.(.+): unknown field/);
  if (field) {
    const key = Number(field[2]);
    return { text: `Key ${key + 1} on ${field[1]}: "${field[3]}" needs newer device software.`, page: field[1], key };
  }
  return { text: `${why.replace(/\.$/, "")}.` };
}
