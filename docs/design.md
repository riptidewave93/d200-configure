# Design

How the site works, and why it works that way.

## Goals

- **Browser only.** The site talks to the device directly, over USB. No server, no account, and the
  PC helper (deckhost) isn't needed.
- **The device's rules.** A config the site accepts is one the device accepts, and a key looks the
  same on the page as on the device.
- **Static hosting.** The site is plain files on GitHub Pages, so a site update never needs a
  firmware update, and the reverse.

## Pieces

```
Browser                                              Device
  UI ── conn.ts ── webhid.ts ════ USB (HID) ════════ deckd (config channel)
   │
   └── deck.ts ── WebAssembly (d200-deck's Go code)
```

| Part | Job |
|---|---|
| UI (`src/App.svelte`, `src/components/`) | The device face, pages, the key editor, files |
| Connection (`src/lib/conn.ts`, `webhid.ts`, `device.svelte.ts`) | Talks to the device: see [Talking to the device](#talking-to-the-device) |
| Config (`src/lib/doc.svelte.ts`) | The config being edited |
| WebAssembly (`wasm/main.go`, `src/lib/deck.ts`) | Checks configs, draws keys, lists icons and names, from d200-deck's own code |

Stack: TypeScript, [Svelte 5](https://svelte.dev/) and [Vite](https://vite.dev/). Svelte compiles
to small plain JavaScript and keeps the UI's state simple, which suits an editor with many linked
fields.

## Talking to the device

The device's USB config channel is a vendor HID interface (usage page `0xFFD2`), which Chrome and
Edge reach through [WebHID](https://developer.mozilla.org/docs/Web/API/WebHID_API). The protocol is
d200-deck's [docs/api.md](https://github.com/riptidewave93/d200-deck/blob/main/docs/api.md);
`proto.ts` and `conn.ts` follow its Go client (`proto/`) closely, with the same names.

- **One request at a time.** The device keeps only the latest request it hasn't read, so `Conn`
  queues requests and waits up to 2 s for each reply.
- **Shared channel.** Every program on the PC that has the device open (the PC helper, other tabs)
  sees every reply. Requests carry a sequence number that starts at a random value, and replies to
  other numbers are ignored.
- **Events** the site uses: `key` (pressing a key on the device selects it on the page),
  `config-changed` (someone else saved) and `usb-rebinding` (the device is about to re-plug).
- **Browsers.** Only Chrome and Edge are supported. Browsers without WebHID (Firefox, Safari, phones)
  get a warning that they can't connect, and can still open and save config files. Other
  Chromium browsers with WebHID get a softer warning (`browserWarning` in `webhid.ts`).
- **The PC helper** sends the device a heartbeat, and the device reports it through the `host`
  command. The site asks every 5 s (nothing announces a change) and uses the answer only for hints,
  such as "The PC helper isn't running".
- **Re-plugging.** Changing a USB setting makes the device drop off USB for a moment. The site waits
  for it to come back, reconnects, and checks it's the same device by its serial number.

## Reading and saving

The config is one JSON file, images and fonts included, up to 2 MiB. It moves in parts of up to
16 KiB (read) and 1 KiB (write): about 30 KB/s read and 50 KB/s write.

1. On connect the site reads the config and remembers its **rev** (its SHA-256).
2. Edits change the config in memory only.
3. **Save to device** first checks the config with the device's own rules (see below), then asks
   the device for its current rev. If someone else saved in the meantime, the site asks whether to
   replace their config or load it. Otherwise it writes the new config, based on the rev it read.
4. The device checks the config again and refuses it, with a reason, if it changed meanwhile or
   isn't valid. The site shows that reason as it is.
5. If the new config gives keys new actions (anything but opening pages, back and home), the device
   asks on its screen first, and answers only after a press, within 60 s. So a website can't make
   keys run things without the user knowing. When the answer doesn't come at once, the site says
   "Press Save on the device to confirm." Changes to looks and pages save at once. A new USB network
   address is asked about the same way ("Press Change").

After a re-plug the site compares revs and reads the config again only if it changed.

## Layout

```
┌ Device Setup ─────────── Unsaved changes  Undo  [Save to device]  Open file  Save file  (● Connected) ┐
├ Pages ──────┬ main › discord ─────────────────────┬ Key 6 / Page ──────────┤
│ ⌂ main      │  ┌───────────────────────────────┐  │ preview                │
│   browser   │  │         the device face       │  │ Look                   │
│   discord   │  └───────────────────────────────┘  │ When pressed           │
│ + Page      │  Pick a key to change it.           │                        │
└─────────────┴─────────────────────────────────────┴────────────────────────┘
```

- **Header:** what applies to the whole config (Save to device, files) and the device (the status
  pill opens its details and settings).
- **Left, the page tree** (`PageTree`, from `src/lib/pages.ts`). The config keeps pages flat, so
  the tree comes from which keys open which page, walking out from the home page. A page opened
  from several places shows once, where it's found in the fewest presses. Keys that go back up, or
  loop, add nothing. Pages no key opens are listed under "Not opened by any key".
- **Middle, the device face**, with a breadcrumb (home › folder › page) above it.
- **Right, one panel:** the selected key (`KeyEditor`), or with no key selected, the page
  (`PagePanel`): its name, the keys that open it, "Show at start" and "Delete page". Escape or a
  click on the device's body goes back to the page.
- **Narrower windows:** under 1100 px the tree moves into a menu on the breadcrumb; under 760 px
  it's one column, the face stays in view while the panel scrolls, and the file buttons go in a
  `⋯` menu.

## Editing

- The config is edited in place, as the JSON objects it was read as. Fields the site doesn't know
  (from a newer device) survive a save.
- A cleared field is removed rather than left empty, so the saved file stays as small and readable
  as one written by hand.
- "Unsaved changes" means the config's JSON differs from the one last read or saved.
- Renaming a page renames the keys that open it. Deleting a page clears them.
- "New page…" in a key's page list makes the page with a Back key already on it, so it can be left
  on the device, and points the key at it.
- Double-clicking a key that opens a page, goes back or goes home does that on the page, as
  pressing it on the device would.
- Key combos can be typed (`ctrl + shift + m`) or recorded by pressing them.
- **Files:** **Open file** and **Save file** read and write `config.json`, for backups and for
  editing without a device. A file opened while connected counts as unsaved until saved to the device.

## The device code in the browser

`wasm/main.go` builds d200-deck's `deck` and `render` packages to WebAssembly. It gives the page:

| Function | From | Used for |
|---|---|---|
| `validate` | `deck.Parse` | Checking a config before saving or opening it |
| `renderKey`, `setAssets` | `render.Renderer` | Key previews, pixel for pixel as on the device |
| `layout` | `render.Key`, `render.Width/Height` | Where the keys sit on the face |
| `iconNames`, `iconPath` | `render.IconNames`, `render.IconPath` | The icon picker |
| `names` | `deck.Keys`, `deck.UsageNames`, ... | Key names, media keys, fonts, app ops |
| `defaultConfig` | `deck.DefaultConfig` | The fake device |

The alternative, rewriting these in TypeScript, would drift from the device over time. The cost is
download size: about 10 MB, 3.2 MB compressed, cached by the browser after the first visit.

Keys redraw when their button changes. Images and fonts are handed to the drawing code only when
they change, since a config can hold megabytes of them.

## Device models

`src/lib/models.ts` lists the kinds of device the site knows. A model has:

| Field | Is |
|---|---|
| `id` | What the device reports as `model` in `hello`, e.g. `ulanzi,d200` |
| `windows` | Where each key's picture shows on the screen, in screen pixels, numbered as in the config |
| `cap` | How far a key cap reaches past its picture, and its corner radius |
| `body` | How far the body reaches past the outer key caps on each side, and its corner radius |

`face()` turns a model into the face the page draws: the grey body, a black cap per key, and the
key's picture inside it. Everything is in screen pixels, so pictures, caps and body line up, and
the face scales with the page.

The site picks a model by the `model` the device reports, then by its number of keys, then the
first in the list (also used with no device). A test checks the D200's windows against d200-deck's
`render.Key`, so the two can't drift. Adding a device means adding its entry here, and its drawing
code in d200-deck.

The page says "device", not "D200", so a new model needs no wording changes.

## Look

- One accent colour, for selection and the main action. Dark and light follow the system, with the
  same colours as the device's update page.
- The page uses the Go fonts, the same family the device draws key labels in. They come from the
  Go module the WebAssembly part is built from.
- The device face is the one detailed element; the rest stays flat and quiet.

## Not done yet

- Adding custom images and fonts (they're kept and drawn if a config already has them).
- Moving or copying keys, e.g. by dragging.
