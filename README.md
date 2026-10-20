# d200-configure

The configuration website for the [Ulanzi D200](https://www.ulanzi.com/) running
[d200-deck](https://github.com/riptidewave93/d200-deck): set up its pages of keys from your browser.

**https://riptidewave93.github.io/d200-configure/**

It runs entirely in the browser and talks to the device over USB (WebHID). There is no server and
nothing to install, apart from a udev rule on Linux.

## Using it

1. Plug the device into your PC.
2. Open the site in **Chrome or Edge** on a desktop. Firefox and Safari can't talk to USB devices.
3. Choose **Connect a device** and pick it from the list.
4. Change keys and pages, then choose **Save to device**.

**Linux:** the browser needs a udev rule to open the device. It comes with the PC helper
([deckhost](https://github.com/riptidewave93/d200-deck/blob/main/docs/install.md)), or install
[70-d200-deck.rules](https://github.com/riptidewave93/d200-deck/blob/main/contrib/linux/70-d200-deck.rules)
on its own:

```bash
sudo curl -o /etc/udev/rules.d/70-d200-deck.rules \
  https://raw.githubusercontent.com/riptidewave93/d200-deck/main/contrib/linux/70-d200-deck.rules
sudo udevadm control --reload && sudo udevadm trigger
```

Without a device, **Open a config file** edits a saved `config.json`. **Save file** keeps a copy of
the config on your PC.

## Docs

| Doc | Read it for |
|---|---|
| [docs/development.md](docs/development.md) | Building, running locally, testing with a device, publishing |
| [docs/design.md](docs/design.md) | What to know before changing the site |

## The D200 project

| Repo | What |
|---|---|
| [d200-buildroot](https://github.com/riptidewave93/d200-buildroot) | The firmware: U-Boot, Linux, the root filesystem; installing, updating, recovery |
| [d200-deck](https://github.com/riptidewave93/d200-deck) | `deckd` (keys and update page on the device), `deckhost` (the PC helper), the config format and USB API |
| [d200-configure](https://github.com/riptidewave93/d200-configure) | The configuration website: https://riptidewave93.github.io/d200-configure/ |

What the site reads and writes is in d200-deck's [config format](https://github.com/riptidewave93/d200-deck/blob/main/docs/config.md)
and [USB protocol](https://github.com/riptidewave93/d200-deck/blob/main/docs/api.md) docs.

## License

GPL-3.0-or-later. The site includes d200-deck's Go code, built to WebAssembly; its third-party parts
are listed in d200-deck's [NOTICE.md](https://github.com/riptidewave93/d200-deck/blob/main/NOTICE.md).
The page uses the [Go fonts](https://go.dev/blog/go-fonts) (BSD-3-Clause), from that same code.
Emoji names and search words are from [emojibase](https://emojibase.dev/) (MIT). The fonts in
`public/fonts/` are from [Google Fonts](https://fonts.google.com/), under the SIL Open Font License
1.1, except Permanent Marker (Apache-2.0); their licenses are in `public/fonts/licenses/`.
