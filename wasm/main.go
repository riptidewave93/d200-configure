// Command wasm runs d200-deck's config and drawing code in the browser, so
// the site checks a config exactly as the device does and shows keys exactly
// as the device draws them. It sets a global "deck" object with:
//
//	validate(json) -> "" or why the device would refuse to save the config (deck.ParseStrict)
//	embed(json) -> JSON {icons, unknown}: the icons the config's keys can show, from
//	  those it has and the catalog, and the names found in neither
//	setAssets(json) -> JSON: the config keys are drawn from (its icons embedded,
//	  as embed does), and the icon names it lacks
//	renderKey(i, buttonJSON, on) -> {width, height, data: RGBA pixels, next}, or null;
//	  next is when the key's animation shows its next frame (Unix ms), or 0
//	fitImage(bytes, width, height, maxBytes) -> JSON {data (base64), width, height, frames,
//	  dropped, changed} or {error}: a picture fitted to the device (see package fit)
//	imageInfo(base64) -> JSON {width, height, frames} or {error}
//	newPage(): the preview shows another page (render.NewPage: each page has its own
//	  animation budget)
//	missingGlyphs(buttonJSON) -> the label characters its font lacks, as a string
//	checkFont(bytes) -> "" or why the device can't use the font
//	subsetFont(bytes, text) -> JSON {data (base64)} or {error, notTrueType}: the font with
//	  only the characters in text (fonts.Subset)
//	fontLacks(base64, text) -> the characters of text the font has no glyph for
//	builtinFallback(actionJSON) -> JSON: what the device does instead while the PC helper
//	  can't run the action (e.g. Discord mute presses Ctrl+Shift+M), or null
//	layout -> JSON: {width, height, keys: [{x, y, w, h}]}, the key windows on the screen
//	iconNames -> JSON: every icon in the catalog, sorted
//	iconPath(name) -> {d, viewBox}: a catalog icon as SVG path data (nonzero fill), or null
//	features -> JSON: what this version of the device software supports (deck.Features)
//	defaultConfig -> JSON: the config a device uses without one
//go:build js && wasm

package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"slices"
	"syscall/js"
	"unicode"

	"golang.org/x/image/font/sfnt"

	"github.com/riptidewave93/d200-deck/deck"
	"github.com/riptidewave93/d200-deck/fonts"
	"github.com/riptidewave93/d200-deck/icons"
	"github.com/riptidewave93/d200-deck/render"

	"github.com/riptidewave93/d200-configure/wasm/fit"
)

var renderer = render.New(&deck.Config{})

func main() {
	js.Global().Set("deck", map[string]any{
		"validate":      js.FuncOf(validate),
		"embed":         js.FuncOf(embed),
		"setAssets":     js.FuncOf(setAssets),
		"renderKey":     js.FuncOf(renderKey),
		"fitImage":      js.FuncOf(fitImage),
		"imageInfo":     js.FuncOf(imageInfo),
		"newPage":       js.FuncOf(func(js.Value, []js.Value) any { renderer.NewPage(); return nil }),
		"missingGlyphs": js.FuncOf(missingGlyphs),
		"checkFont":     js.FuncOf(checkFont),
		"subsetFont":    js.FuncOf(subsetFont),
		"fontLacks":     js.FuncOf(fontLacks),
		"builtinFallback": js.FuncOf(func(_ js.Value, args []js.Value) any {
			var a deck.Action
			if len(args) != 1 || json.Unmarshal([]byte(args[0].String()), &a) != nil {
				return "null"
			}
			a.Fallback = nil // only the built-in one
			return marshal(a.FallbackAction())
		}),
		"layout":        layout(),
		"iconNames":     marshal(icons.Names()),
		"iconPath":      js.FuncOf(iconPath),
		"features":      marshal(deck.Features()),
		"defaultConfig": marshal(deck.DefaultConfig()),
	})
	select {}
}

func validate(_ js.Value, args []js.Value) any {
	if len(args) != 1 || args[0].Type() != js.TypeString {
		return "validate needs the config as a string"
	}
	if _, err := deck.ParseStrict([]byte(args[0].String())); err != nil {
		return err.Error()
	}
	return ""
}

// embedded reads a config without checking it (it may be mid-edit) and
// gives it the icons its keys can show.
func embedded(s string) (*deck.Config, []string, error) {
	var c deck.Config
	if err := json.Unmarshal([]byte(s), &c); err != nil {
		return nil, nil, err
	}
	unknown := icons.Embed(&c)
	if unknown == nil {
		unknown = []string{}
	}
	return &c, unknown, nil
}

func embed(_ js.Value, args []js.Value) any {
	c, unknown, err := embedded(args[0].String())
	if err != nil {
		return marshal(map[string]any{"error": err.Error()})
	}
	return marshal(map[string]any{"icons": c.Icons, "unknown": unknown})
}

// setAssets switches drawing to a config, which drops the decoded images
// and fonts.
func setAssets(_ js.Value, args []js.Value) any {
	c, unknown, err := embedded(args[0].String())
	if err != nil {
		return marshal(map[string]any{"error": err.Error()})
	}
	renderer.SetConfig(c)
	return marshal(map[string]any{"unknown": unknown})
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
	next := 0.0 // a float: TinyGo's int is 32 bits
	if t := renderer.Next(); !t.IsZero() {
		next = float64(t.UnixMilli())
	}
	return map[string]any{"width": img.Rect.Dx(), "height": img.Rect.Dy(), "data": data, "next": next}
}

func missingGlyphs(_ js.Value, args []js.Value) any {
	if len(args) != 1 {
		return ""
	}
	return string(renderer.MissingGlyphs(button(args[0].String())))
}

func checkFont(_ js.Value, args []js.Value) any {
	if err := deck.CheckFont(base64.StdEncoding.EncodeToString(bytesOf(args[0]))); err != nil {
		return err.Error()
	}
	return ""
}

func subsetFont(_ js.Value, args []js.Value) any {
	b, err := fonts.Subset(bytesOf(args[0]), []rune(args[1].String()))
	if err != nil {
		return marshal(map[string]any{"error": err.Error(), "notTrueType": errors.Is(err, fonts.ErrNotTrueType)})
	}
	return marshal(map[string]any{"data": base64.StdEncoding.EncodeToString(b)})
}

func fontLacks(_ js.Value, args []js.Value) any {
	text := args[1].String()
	b, err := base64.StdEncoding.DecodeString(args[0].String())
	if err != nil {
		return text
	}
	f, err := sfnt.Parse(b)
	if err != nil {
		return text
	}
	var buf sfnt.Buffer
	var lacks []rune
	for _, r := range text {
		if unicode.IsControl(r) || slices.Contains(lacks, r) {
			continue
		}
		if g, err := f.GlyphIndex(&buf, r); err != nil || g == 0 {
			lacks = append(lacks, r)
		}
	}
	return string(lacks)
}

func bytesOf(v js.Value) []byte {
	b := make([]byte, v.Length())
	js.CopyBytesToGo(b, v)
	return b
}

func fitImage(_ js.Value, args []js.Value) any {
	if len(args) != 4 {
		return marshal(map[string]any{"error": "fitImage needs bytes, width, height and maxBytes"})
	}
	p, err := fit.Fit(bytesOf(args[0]), fit.Box{Width: args[1].Int(), Height: args[2].Int(), Bytes: args[3].Int()})
	if err != nil {
		return marshal(map[string]any{"error": err.Error()})
	}
	return marshal(map[string]any{
		"data": base64.StdEncoding.EncodeToString(p.Data), "width": p.Width, "height": p.Height,
		"frames": p.Frames, "dropped": p.Dropped, "changed": p.Changed,
	})
}

func imageInfo(_ js.Value, args []js.Value) any {
	b, err := base64.StdEncoding.DecodeString(args[0].String())
	if err != nil {
		return marshal(map[string]any{"error": "not base64"})
	}
	w, h, frames, err := fit.Info(b)
	if err != nil {
		return marshal(map[string]any{"error": err.Error()})
	}
	return marshal(map[string]any{"width": w, "height": h, "frames": frames})
}

func iconPath(_ js.Value, args []js.Value) any {
	if len(args) != 1 {
		return nil
	}
	icon, ok := icons.Get(args[0].String())
	if !ok || icon.D == "" {
		return nil
	}
	return map[string]any{"d": icon.D, "viewBox": icon.ViewBox}
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

func marshal(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(b)
}
