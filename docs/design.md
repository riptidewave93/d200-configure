# Design

What to know before changing the site. The protocol and config format are d200-deck's
[api.md](https://github.com/riptidewave93/d200-deck/blob/main/docs/api.md) and
[config.md](https://github.com/riptidewave93/d200-deck/blob/main/docs/config.md).

## Rules

- **Browser only.** The site talks to the device over WebHID. No server; GitHub Pages serves it.
- **The device's own code.** Checking configs, drawing keys, icons and font subsetting come from
  d200-deck's Go packages, built to WebAssembly. Don't rewrite them in TypeScript.
- **Only what the device supports** ([below](#older-and-newer-devices)).
- **UI text** says "device", not "D200".

## Code

| Path | What |
|---|---|
| `src/App.svelte` | The page: connecting, saving, files |
| `src/components/` | Page tree, breadcrumb, device face, key and page panels, action editor, device panel |
| `src/lib/proto.ts`, `conn.ts` | The protocol and a connection, after d200-deck's `proto/` (same names) |
| `src/lib/webhid.ts`, `device.svelte.ts` | Opening the device, reconnecting after it re-plugs |
| `src/lib/gzip.ts` | Gzipped configs |
| `src/lib/config.ts`, `doc.svelte.ts` | The config's types, and the config being edited |
| `src/lib/features.ts` | What to offer, and the pre-save check |
| `src/lib/errors.ts` | Why a config can't be saved, in plain words |
| `src/lib/actions.ts`, `keys.ts` | Words for actions, keys and app ops |
| `src/lib/pages.ts` | The page tree, from the keys that open pages |
| `src/lib/deck.ts`, `draw.ts` | Loading the WebAssembly part, drawing keys with it |
| `src/lib/emoji.ts`, `pictures.ts`, `fonts.ts` | Emoji, pictures and fonts going into the config |
| `src/lib/logos.ts` | The app logos, and a key's colours for one |
| `src/lib/mac.ts` | Mac key combos, and telling the device which computer it's on |
| `src/lib/align.ts` | Align screen |
| `src/lib/models.ts` | The kinds of device: keys and face |
| `src/lib/fakedevice.ts` | An in-memory device, for tests and `?fake` |
| `wasm/main.go` | The WebAssembly part |
| `wasm/fit/` | Fitting pictures to the device's limits |

Tests sit next to the code, as `*.test.ts` and `*_test.go`.

## The WebAssembly part

`wasm/main.go` gives the page d200-deck's code:

| Function | From | Used for |
|---|---|---|
| `validate` | `deck.ParseStrict` | Checking a config before saving or opening it |
| `renderKey`, `setAssets` | `render.Renderer`, `icons.Embed` | Key previews, as the device draws them |
| `embed` | `icons.Embed` | Copying the icons keys use into the config |
| `features` | `deck.Features` | What the site supports |
| `fitImage` | `wasm/fit`, `deck.ImageSize` | Fitting pictures as they're added |
| `animBytes`, `pictureBox` | `render.AnimBytes`, `render.PictureBox` | A page's animation budget, as the device counts it |
| `layout` | `render.Key` | Where the keys sit on the face |
| `iconNames`, `iconPath` | `icons.Names`, `icons.Get` | The icon picker |
| `missingGlyphs`, `fontLacks` | `render.MissingGlyphs` | Warning about characters a font lacks |
| `subsetFont`, `checkFont` | `fonts.Subset`, `deck.CheckFont` | Fonts cut down to their labels; fonts from files |
| `newPage` | `render.NewPage` | Each page's own animation budget |
| `builtinFallback` | `Action.FallbackAction` | What an app key does without the PC helper |
| `defaultConfig` | `deck.DefaultConfig` | The fake device |

It's built with TinyGo, so:

- the build uses Go's older JSON code (`GOEXPERIMENT=nojsonv2`);
- an `int` is 32 bits: times in milliseconds go through `float64` or `int64`.

## Talking to the device

- `Conn` sends one request at a time and waits up to 2 s for each reply
  ([api.md](https://github.com/riptidewave93/d200-deck/blob/main/docs/api.md#requests)).
- Protocol 4 only. An older device (its reports are smaller) is told to update, a newer one to
  reload the page.
- Configs move gzipped once the device reports their `gzip_size`, and as they are until then (just
  after it starts or gets a new config).
- Events: `key` selects that key on the page, `config-changed` offers to load the new config,
  `usb-rebinding` waits for the device to re-plug and reconnects to the same serial number.
- The site sends the time on connecting and every hour, and asks every 5 s whether the PC helper
  runs.
- Settings show only when the device reports them. Brightness is sent at most 10 times a second
  while the slider moves, and always the last value.
- `editing` is on while the page is visible, so a press on the device only selects the key here.
  It's sent again every 3 s, and turned off when the page is hidden or closed and before
  disconnecting.
- `screen_pattern` is sent again every 20 s while Align screen is open, and turned off on Done, on
  closing the panel and when the page closes.
- Reset device waits for a press on the device, which then restarts without an event: the site goes
  back to the start screen and reconnects, giving up after 90 s.
- `host_os` is set on connect to the browser's computer, if it changed and the PC helper isn't
  connected. On a Mac the editor shows and edits a combo's `mac_keys` where it has them, else
  `keys`; a device without `action.mac_keys` is sent the config without them.

## Saving

1. On connect the site reads the config and keeps its rev (SHA-256).
2. Save checks that the device supports what the config uses, then runs `validate`.
3. If the device's rev changed meanwhile, the site asks whether to replace that config or load it.
4. The device checks again and may refuse with a reason. The site words it as a fix (`errors.ts`)
   and selects the key it's about.
5. New key actions and a new USB address wait for a press on the device; the site says so.

Saving (to the device or a file) also embeds the catalog icons the keys use and drops icons,
images and fonts no key uses.

## Older and newer devices

hello's `features` ([api.md](https://github.com/riptidewave93/d200-deck/blob/main/docs/api.md#features))
lists what the device's software supports. The site offers what's in both that and its own list
(`deck.features`):

| Part | Offered |
|---|---|
| Action types; key, media key, system and font names; fields such as `button.on` | In both lists |
| App actions and their settings | The device's list, or all for an app it doesn't know; while the PC helper is connected, only what it runs |
| Newer settings such as `editing`, and requests such as `reset` | Only what the device lists |
| Limits | The smaller of the two. Without `config_bytes` a device takes 2 MB; without `anim_bytes`, the older GIF budget |

A device without `features` gets the site's lists, and the older limits. A value already in the
config always shows. Before saving, `unsupportedMessage` refuses a config that uses what the device lacks.
Gate a new option in the editor on its field or name.

## Pictures and fonts

- **Pictures** are fitted when added (`wasm/fit`): scaled to where they're drawn, animated GIFs
  thinned to what the page's other GIFs leave of its animation budget (`anim_bytes`, a byte a
  pixel; 4 on devices without it), then encoded within the byte limit. A page over the budget gets
  a warning: the device shows the GIFs past it as still pictures.
- **App logos** (`src/lib/logos.json`, made by `make logos` and kept in git) go into the config as
  path icons. `scripts/logos.mjs` takes them from the icon packages in `package.json`, redraws arcs
  as curves, since the device can't draw arcs, and stops on a licence that can't ship with the site
  or that `NOTICE.md` doesn't credit. A logo sets the key's colours too: the brand colour if it has
  3:1 contrast on the key's background, else white (black on a light one) on the brand colour; a
  near-black brand keeps the key's background.
- **Emoji** are drawn with the computer's emoji font into a PNG icon named `emoji-<code points>`.
- **Catalog fonts** (`src/lib/fontcatalog.json`) are downloaded by `make fonts` into
  `public/fonts/`, kept in git. A font goes into the config cut down to the characters its labels
  use, and grows from the catalog as labels change. Leave out fonts whose license has a Reserved
  Font Name: a cut-down copy may not use the name.
- **Fonts from files:** TrueType, OpenType or WOFF. One over the size limit is cut down (TrueType
  only) and kept whole only until the page closes.

## Device models

`src/lib/models.ts` has one entry per kind of device:

| Field | Is |
|---|---|
| `id` | The `model` the device reports in hello, e.g. `ulanzi,d200` |
| `windows` | Each key's picture on the screen, in screen pixels |
| `cap`, `body` | How far key caps and the body reach past the pictures, and their corner radii |

The site picks a model by `model`, then by number of keys, then the first. A test checks the
D200's windows against d200-deck's `render.Key`. A new device needs an entry here and its drawing
code in d200-deck.

## Look

The accent, text and error colours match the device's update page
(`internal/deckupdate/style.css` in d200-deck); change both together. The page uses the Go fonts,
as the device does. Dark and light follow the system.
