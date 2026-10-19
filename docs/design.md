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

- **Requests.** `Conn` sends one request at a time, queuing the rest, and waits up to 2 s for each
  reply. Why, and how replies are matched on a channel other programs share, is in
  [api.md](https://github.com/riptidewave93/d200-deck/blob/main/docs/api.md#requests).
- **Events** the site uses: `key` (pressing a key on the device selects it on the page),
  `config-changed` (someone else saved) and `usb-rebinding` (the device is about to re-plug).
- **Browsers.** Only Chrome and Edge are supported. Browsers without WebHID (Firefox, Safari, phones)
  get a warning that they can't connect, and can still open and save config files. Other
  Chromium browsers with WebHID get a softer warning (`browserWarning` in `webhid.ts`).
- **The PC helper** sends the device a heartbeat, and the device reports it through the `host`
  command. The site asks every 5 s (nothing announces a change) and uses the answer only for hints,
  such as "The PC helper isn't running".
- **The clock.** The device has no battery-backed clock, so the site sends it the time on
  connecting and every hour, as the PC helper does. It ignores a device that doesn't know the
  command.
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
5. Some saves wait for a press on the device: new key actions ([api.md](https://github.com/riptidewave93/d200-deck/blob/main/docs/api.md#the-config))
   and a new USB network address ([api.md](https://github.com/riptidewave93/d200-deck/blob/main/docs/api.md#settings)). When the answer doesn't come at once,
   the site says "Press Save on the device to confirm." (or "Press Change").

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

## Icons, emoji and pictures

The device keeps no icon catalog: a config carries the icons its keys show, in `icons` (d200-deck's
[config.md](https://github.com/riptidewave93/d200-deck/blob/main/docs/config.md)). The catalog
(Material Symbols and a few of d200-deck's own) lives in the site, through d200-deck's `icons`
package.

- **Picking** an icon only sets the key's `icon` name.
- **Saving** (to the device or a file) runs `icons.Embed`: it copies in the catalog icons the keys
  use, including Discord's built-in looks, and drops the ones no key uses. A name that's in neither
  the config nor the catalog stops the save, with its name.
- **Previews** embed into a copy of the config before drawing, so they match the device.
- **Emoji:** the device has no emoji font, so a picked emoji is drawn here, with the computer's own
  emoji font, into a 120 px PNG (about 7–15 KB) and kept as an icon named `emoji-<code points>`,
  e.g. `emoji-1f3ae`. It's drawn at icon size, like other icons. Each emoji is kept once however
  many keys use it, and dropped when none does. The names and search words come from
  [emojibase](https://emojibase.dev/) (MIT), loaded only when the emoji picker opens.
- **Pictures** from files (PNG, JPEG, GIF, or anything else the browser reads, turned into PNG
  first) go in as a key's `image`, which fills the key, or as a picture icon (`pic-<file name>`),
  drawn at icon size beside a label. Animated GIFs move, on the device and in the previews.

### Fitting pictures

The device's limits are tight (an image 256 KiB, a picture icon 24 KiB and 128 px), so a picture
is fitted when it's added, by `wasm/fit` in the browser. A picture that already fits is kept as it
is; otherwise:

1. It's scaled down to where it's drawn: the key it's on (196 px, or the wide key), or 120 px for
   an icon. Never up: the device does that when drawing.
2. An animated GIF keeps every nth frame (their times added up) until it's within 100 frames and
   the 2 M frame pixels the device animates, counted at the size it's drawn. Past that budget the
   device shows a GIF's first frame, which a GIF that passes the config check alone can hit.
3. It's encoded within the byte limit: PNG, then JPEG for opaque stills; a GIF with one palette
   and only the pixels that change in each frame. If it's still too big, a GIF loses more frames
   (down to 12), then everything shrinks by 15% and tries again.

The page says what changed ("Made smaller to fit: 120×120, 24 of 48 frames"). The device's
animation budget covers every GIF it has shown since the config loaded, so the page warns when
the whole config's GIFs add up to more. Saving drops images no key shows, as it does icons.

## The device code in the browser

`wasm/main.go` builds d200-deck's `deck` and `render` packages to WebAssembly. It gives the page:

| Function | From | Used for |
|---|---|---|
| `validate` | `deck.Parse` | Checking a config before saving or opening it |
| `renderKey`, `setAssets` | `render.Renderer`, `icons.Embed` | Key previews, pixel for pixel as on the device; animated GIFs redraw when `Renderer.Next` says |
| `fitImage`, `imageInfo` | `wasm/fit`, `deck.ImageSize` | Fitting pictures as they're added (above) |
| `layout` | `render.Key`, `render.Width/Height` | Where the keys sit on the face |
| `iconNames`, `iconPath` | `icons.Names`, `icons.Get` | The icon picker |
| `embed` | `icons.Embed` | Copying the icons keys use into the config before saving |
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

- One accent colour, for selection and the main action. Dark and light follow the system. The
  accent, text and error colours are the device's update page's (`internal/deckupdate/style.css`
  in d200-deck), so change both together.
- The page uses the Go fonts, the same family the device draws key labels in. They come from the
  Go module the WebAssembly part is built from.
- The device face is the one detailed element; the rest stays flat and quiet.

## Not done yet

- Adding custom fonts (they're kept and drawn if a config already has them).
- A warning for label characters the device's fonts don't have (they show as boxes).
- Moving or copying keys, e.g. by dragging.
