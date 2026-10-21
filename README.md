# d200-configure

Set up your Ulanzi D200's keys from your browser: **https://riptidewave93.github.io/d200-configure/**

## What you get

- Pages of keys with icons, app logos, emoji, pictures (animated GIFs too) and labels in the font
  you like
- Keys that press a key combo or media key, type text, run a macro or open another page; with the
  PC helper, keys that open a website or program, or control Discord, OBS or your music player
- A preview of each key as the D200 shows it, and a warning when a page has more animation than the
  D200 can play
- Press a key on the D200 to pick it here; while the site's tab is in front, keys don't run their
  actions
- The D200's settings: brightness, the screen while your computer sleeps, lining the picture up
  with the keys, the USB drive and network, and a reset that erases its keys and settings
- No D200 needed to start: begin from the default keys or a saved config, and save it to a file

## What you need

- A D200 running the [d200-buildroot firmware](https://github.com/riptidewave93/d200-buildroot).
- Chrome or Edge on a computer. Firefox, Safari and phones can't open USB devices.
- On Linux, a udev rule so the browser can open the D200: the PC helper installs it, or install
  [the rule](https://github.com/riptidewave93/d200-deck/blob/main/contrib/linux/70-d200-deck.rules)
  on its own.
- The [PC helper](https://github.com/riptidewave93/d200-deck/blob/main/docs/install.md), for keys
  that open websites or programs, or control apps.

## Using it

1. Plug in the D200 and open the site.
2. Choose **Connect a device** and pick it.
3. Change keys and pages, then choose **Save to device**. When keys get new actions, the D200 asks
   you to confirm on its screen.
4. For the D200's settings, choose **Connected** at the top.

Without a D200, choose **Start a new config** or **Open a config file**, and **Save file** when
you're done.

## The D200 project

| Repo | What |
|---|---|
| [d200-buildroot](https://github.com/riptidewave93/d200-buildroot) | The firmware: installing, updating, recovery |
| [d200-deck](https://github.com/riptidewave93/d200-deck) | The keys on the D200, and the PC helper |
| [d200-configure](https://github.com/riptidewave93/d200-configure) | This website |

## Developing

[docs/development.md](docs/development.md) builds and runs the site locally, and says how
[changes go in](docs/development.md#contributing); [docs/design.md](docs/design.md) is what to know
before changing it.

## License

GPL-3.0-or-later. The site includes d200-deck's Go code, built to WebAssembly; its third-party parts
are listed in d200-deck's [NOTICE.md](https://github.com/riptidewave93/d200-deck/blob/main/NOTICE.md).
The page uses the [Go fonts](https://go.dev/blog/go-fonts) (BSD-3-Clause), from that same code.
Emoji names and search words are from [emojibase](https://emojibase.dev/) (MIT). The fonts in
`public/fonts/` are from [Google Fonts](https://fonts.google.com/), under the SIL Open Font License
1.1, except Permanent Marker (Apache-2.0); their licenses are in `public/fonts/licenses/`. The app
logos are from [Simple Icons](https://simpleicons.org/) and are their makers' trademarks;
[NOTICE.md](NOTICE.md) lists their licenses.
