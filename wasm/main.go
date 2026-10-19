// Command wasm runs d200-deck's config and drawing code in the browser, so
// the site checks a config exactly as the device does and shows keys exactly
// as the device draws them. It sets a global "deck" object with:
//
//	validate(json) -> "" or why the config isn't valid
//	setAssets(json) -> "" or an error: the config whose images and fonts keys use
//	renderKey(i, buttonJSON, on) -> {width, height, data: RGBA pixels}, or null
//	layout -> JSON: {width, height, keys: [{x, y, w, h}]}, the key windows on the screen
//	iconNames -> JSON: every built-in icon name, sorted
//	iconPath(name) -> {d, viewBox}: an icon as SVG path data (nonzero fill), or null
//	names -> JSON: the key, media key, system and font names, and app ops
//	defaultConfig -> JSON: the config a device uses without one
package main

import (
	"encoding/json"
	"maps"
	"slices"
	"syscall/js"

	"github.com/riptidewave93/d200-deck/deck"
	"github.com/riptidewave93/d200-deck/render"
)

var renderer = render.New(&deck.Config{})

func main() {
	js.Global().Set("deck", map[string]any{
		"validate":      js.FuncOf(validate),
		"setAssets":     js.FuncOf(setAssets),
		"renderKey":     js.FuncOf(renderKey),
		"layout":        layout(),
		"iconNames":     marshal(render.IconNames()),
		"iconPath":      js.FuncOf(iconPath),
		"names":         names(),
		"defaultConfig": marshal(deck.DefaultConfig()),
	})
	select {}
}

func validate(_ js.Value, args []js.Value) any {
	if len(args) != 1 || args[0].Type() != js.TypeString {
		return "validate needs the config as a string"
	}
	if _, err := deck.Parse([]byte(args[0].String())); err != nil {
		return err.Error()
	}
	return ""
}

// setAssets takes a config without checking it: keys draw while it's being
// edited, valid or not. A new config drops the decoded images and fonts.
func setAssets(_ js.Value, args []js.Value) any {
	var c deck.Config
	if err := json.Unmarshal([]byte(args[0].String()), &c); err != nil {
		return err.Error()
	}
	renderer.SetConfig(&c)
	return ""
}

// button reads a button for drawing. An action that doesn't parse (say, a
// half-typed media key) only loses the built-in app look it would give.
func button(s string) deck.Button {
	var raw struct {
		deck.Look
		On     *deck.Look      `json:"on"`
		Action json.RawMessage `json:"action"`
	}
	json.Unmarshal([]byte(s), &raw)
	b := deck.Button{
		Icon: raw.Icon, Image: raw.Image, Label: raw.Label, Font: raw.Font,
		Color: raw.Color, Background: raw.Background, On: raw.On,
	}
	json.Unmarshal(raw.Action, &b.Action)
	return b
}

func renderKey(_ js.Value, args []js.Value) any {
	if len(args) != 3 {
		return nil
	}
	img := renderer.Key(args[0].Int(), button(args[1].String()), args[2].Bool())
	if img == nil {
		return nil
	}
	data := js.Global().Get("Uint8ClampedArray").New(len(img.Pix))
	js.CopyBytesToJS(data, img.Pix)
	return map[string]any{"width": img.Rect.Dx(), "height": img.Rect.Dy(), "data": data}
}

func iconPath(_ js.Value, args []js.Value) any {
	if len(args) != 1 {
		return nil
	}
	d, viewBox, ok := render.IconPath(args[0].String())
	if !ok {
		return nil
	}
	return map[string]any{"d": d, "viewBox": viewBox}
}

func layout() string {
	type rect struct {
		X int `json:"x"`
		Y int `json:"y"`
		W int `json:"w"`
		H int `json:"h"`
	}
	keys := make([]rect, deck.KeyCount)
	for i := range keys {
		r := render.Key(i)
		keys[i] = rect{r.Min.X, r.Min.Y, r.Dx(), r.Dy()}
	}
	return marshal(map[string]any{"width": render.Width, "height": render.Height, "keys": keys})
}

func names() string {
	return marshal(map[string]any{
		"keys":      slices.Sorted(maps.Keys(deck.Keys)), // some are aliases of others
		"modifiers": slices.Sorted(maps.Keys(deck.Modifiers)),
		"usages":    slices.Sorted(maps.Keys(deck.UsageNames)),
		"systems":   slices.Sorted(maps.Keys(deck.SystemNames)),
		"fonts":     deck.BuiltinFonts,
		"apps":      map[string][]string{deck.AppDiscord: deck.DiscordOps},
	})
}

func marshal(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(b)
}
