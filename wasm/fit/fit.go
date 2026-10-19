// Package fit makes a picture fit the device: scaled down to the size it's
// drawn at and within the config's limits, so a picture someone picks just
// works. An animated GIF stays animated, losing frames only if it must.
package fit

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"image/jpeg"
	"image/png"
	"math"
	"slices"

	xdraw "golang.org/x/image/draw"

	"github.com/riptidewave93/d200-deck/deck"
)

// Box is the most a picture can be: its size on the device, and its bytes.
type Box struct {
	Width, Height int
	Bytes         int
}

// Picture is a fitted picture.
type Picture struct {
	Data          []byte
	Width, Height int
	Frames        int // 1 unless it's an animated GIF
	Dropped       int // frames left out to fit
	Changed       bool
}

// Below this, shrinking further won't help: the picture is too detailed.
const minSide = 16

// The fewest frames kept before shrinking an animation instead.
const minFrames = 12

// MaxAnimPixels is what the device animates at once, in frame pixels at the
// size it draws them (d200-deck's render.maxAnimPixels); past it, a GIF
// shows its first frame. A fitted GIF stays within it, so it moves.
const MaxAnimPixels = 2 << 20

var errTooBig = errors.New("too detailed to fit, even made smaller")

// Fit fits a PNG, JPEG or GIF picture in box. A picture that already fits
// is kept as it is.
func Fit(b []byte, box Box) (Picture, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil {
		return Picture{}, errors.New("not a PNG, JPEG or GIF image")
	}
	if format == "gif" {
		g, err := gif.DecodeAll(bytes.NewReader(b))
		if err != nil {
			return Picture{}, errors.New("a broken GIF")
		}
		if len(g.Image) > 1 {
			return animated(b, g, box)
		}
	}
	if format != "png" && format != "jpeg" && format != "gif" {
		return Picture{}, fmt.Errorf("%s images aren't supported", format)
	}
	if cfg.Width <= box.Width && cfg.Height <= box.Height && len(b) <= box.Bytes {
		return Picture{Data: b, Width: cfg.Width, Height: cfg.Height, Frames: 1}, check(b)
	}
	img, _, err := image.Decode(bytes.NewReader(b))
	if err != nil {
		return Picture{}, errors.New("not a PNG, JPEG or GIF image")
	}
	opaque := isOpaque(img)
	for s := scale(cfg.Width, cfg.Height, box); ; s *= 0.85 {
		w, h := size(cfg.Width, cfg.Height, s)
		if w < minSide && h < minSide {
			return Picture{}, errTooBig
		}
		small := resize(img, w, h)
		out := encodePNG(small)
		if len(out) > box.Bytes && opaque {
			for q := 90; q >= 60 && len(out) > box.Bytes; q -= 10 {
				var buf bytes.Buffer
				jpeg.Encode(&buf, small, &jpeg.Options{Quality: q})
				out = buf.Bytes()
			}
		}
		if len(out) <= box.Bytes {
			return Picture{Data: out, Width: w, Height: h, Frames: 1, Changed: true}, check(out)
		}
	}
}

// animated fits an animated GIF: scaled, with every nth frame if it has too
// many (their times added up), and only what changes stored for each frame.
func animated(b []byte, g *gif.GIF, box Box) (Picture, error) {
	w0, h0 := g.Config.Width, g.Config.Height
	frames, delays := composite(g)
	n := len(frames)
	// the device draws it scaled to fit the box, larger too
	dw, dh := size(w0, h0, min(float64(box.Width)/float64(w0), float64(box.Height)/float64(h0)))
	tooMany := func(frames, w, h int) bool {
		return frames > deck.MaxFrames || frames*w*h > deck.MaxGIFPixels || frames*dw*dh > MaxAnimPixels
	}
	step := 1
	if w0 <= box.Width && h0 <= box.Height && len(b) <= box.Bytes && !tooMany(n, w0, h0) {
		return Picture{Data: b, Width: w0, Height: h0, Frames: n}, check(b)
	}
	for s := scale(w0, h0, box); ; {
		w, h := size(w0, h0, s)
		if w < minSide && h < minSide {
			return Picture{}, errTooBig
		}
		for tooMany(kept(n, step), w, h) {
			step++
		}
		out := encodeGIF(frames, delays, step, w, h, g.LoopCount)
		k := kept(n, step)
		if len(out) <= box.Bytes {
			return Picture{Data: out, Width: w, Height: h, Frames: k, Dropped: n - k, Changed: true}, check(out)
		}
		if k > minFrames {
			step++
		} else {
			s *= 0.85
		}
	}
}

func kept(n, step int) int { return (n + step - 1) / step }

// composite draws each frame over what the frames before it left, as a
// GIF is shown, giving whole pictures and their delays.
func composite(g *gif.GIF) ([]*image.RGBA, []int) {
	r := image.Rect(0, 0, g.Config.Width, g.Config.Height)
	canvas := image.NewRGBA(r)
	frames := make([]*image.RGBA, len(g.Image))
	delays := make([]int, len(g.Image))
	for i, f := range g.Image {
		var before *image.RGBA
		disposal := byte(0)
		if i < len(g.Disposal) {
			disposal = g.Disposal[i]
		}
		if disposal == gif.DisposalPrevious {
			before = image.NewRGBA(r)
			copy(before.Pix, canvas.Pix)
		}
		draw.Draw(canvas, f.Bounds(), f, f.Bounds().Min, draw.Over)
		frames[i] = image.NewRGBA(r)
		copy(frames[i].Pix, canvas.Pix)
		delays[i] = 10
		if i < len(g.Delay) && g.Delay[i] >= 2 { // the device plays 0 and 1 as 10
			delays[i] = g.Delay[i]
		}
		switch disposal {
		case gif.DisposalBackground:
			draw.Draw(canvas, f.Bounds(), image.Transparent, image.Point{}, draw.Src)
		case gif.DisposalPrevious:
			canvas = before
		}
	}
	return frames, delays
}

// encodeGIF scales every step-th frame to w x h and encodes them with one
// palette. Each frame stores only the pixels that change, unless something
// turns transparent: then the frame before it is cleared and it's stored whole.
func encodeGIF(frames []*image.RGBA, delays []int, step, w, h, loop int) []byte {
	var small []*image.RGBA
	var times []int
	for i := 0; i < len(frames); i += step {
		small = append(small, resize(frames[i], w, h))
		t := 0
		for j := i; j < i+step && j < len(frames); j++ {
			t += delays[j]
		}
		times = append(times, t)
	}
	pal, index := palette(small)
	none := uint8(len(pal) - 1) // the transparent entry
	out := &gif.GIF{LoopCount: loop, Config: image.Config{ColorModel: pal, Width: w, Height: h}}
	var prev *image.Paletted
	for i, f := range small {
		p := image.NewPaletted(f.Rect, pal)
		for j := 0; j < len(f.Pix); j += 4 {
			if f.Pix[j+3] < 128 {
				p.Pix[j/4] = none
			} else {
				p.Pix[j/4] = index(f.Pix[j], f.Pix[j+1], f.Pix[j+2])
			}
		}
		stored := p
		if prev != nil {
			delta := true
			for j := range p.Pix {
				if p.Pix[j] == none && prev.Pix[j] != none {
					delta = false
					break
				}
			}
			if delta {
				stored = image.NewPaletted(p.Rect, pal)
				for j := range p.Pix {
					if p.Pix[j] == prev.Pix[j] {
						stored.Pix[j] = none
					} else {
						stored.Pix[j] = p.Pix[j]
					}
				}
				out.Disposal[i-1] = gif.DisposalNone
			}
		}
		out.Image = append(out.Image, stored)
		out.Delay = append(out.Delay, times[i])
		// cleared after showing unless the next frame builds on it; the
		// last one is, so the loop starts on a clean picture
		out.Disposal = append(out.Disposal, gif.DisposalBackground)
		prev = p
	}
	var buf bytes.Buffer
	gif.EncodeAll(&buf, out)
	return buf.Bytes()
}

// palette picks up to 255 colours for frames, the most common first, plus
// a transparent one last, and a way to find the nearest.
func palette(frames []*image.RGBA) (color.Palette, func(r, g, b uint8) uint8) {
	// count colours in 5-bit bins, keeping their sums for an average
	type bin struct{ n, r, g, b int }
	bins := map[int]*bin{}
	for _, f := range frames {
		for j := 0; j < len(f.Pix); j += 4 {
			if f.Pix[j+3] < 128 {
				continue
			}
			r, g, b := int(f.Pix[j]), int(f.Pix[j+1]), int(f.Pix[j+2])
			k := r>>3<<10 | g>>3<<5 | b>>3
			x := bins[k]
			if x == nil {
				x = &bin{}
				bins[k] = x
			}
			x.n++
			x.r += r
			x.g += g
			x.b += b
		}
	}
	all := make([]*bin, 0, len(bins))
	for _, x := range bins {
		all = append(all, x)
	}
	// most common first; ties by colour, so the result doesn't vary
	slices.SortFunc(all, func(a, b *bin) int {
		if a.n != b.n {
			return b.n - a.n
		}
		return (a.r*65536 + a.g*256 + a.b) - (b.r*65536 + b.g*256 + b.b)
	})
	if len(all) > 255 {
		all = all[:255]
	}
	pal := make(color.Palette, 0, len(all)+1)
	for _, x := range all {
		pal = append(pal, color.RGBA{uint8(x.r / x.n), uint8(x.g / x.n), uint8(x.b / x.n), 255})
	}
	opaque := len(pal)
	pal = append(pal, color.RGBA{})
	// nearest colour, remembered per 6-bit colour
	memo := make([]int16, 1<<18)
	return pal, func(r, g, b uint8) uint8 {
		k := int(r>>2)<<12 | int(g>>2)<<6 | int(b>>2)
		if memo[k] > 0 {
			return uint8(memo[k] - 1)
		}
		best, bestD := 0, math.MaxInt
		for i := 0; i < opaque; i++ {
			c := pal[i].(color.RGBA)
			dr, dg, db := int(c.R)-int(r), int(c.G)-int(g), int(c.B)-int(b)
			if d := dr*dr + dg*dg + db*db; d < bestD {
				best, bestD = i, d
			}
		}
		memo[k] = int16(best + 1)
		return uint8(best)
	}
}

// scale is how much to shrink w x h to fit box; never more than 1.
func scale(w, h int, box Box) float64 {
	return min(1, float64(box.Width)/float64(w), float64(box.Height)/float64(h))
}

func size(w, h int, s float64) (int, int) {
	return max(1, int(math.Round(float64(w)*s))), max(1, int(math.Round(float64(h)*s)))
}

func resize(src image.Image, w, h int) *image.RGBA {
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	xdraw.CatmullRom.Scale(dst, dst.Rect, src, src.Bounds(), draw.Src, nil)
	return dst
}

func encodePNG(img image.Image) []byte {
	var buf bytes.Buffer
	(&png.Encoder{CompressionLevel: png.BestCompression}).Encode(&buf, img)
	return buf.Bytes()
}

func isOpaque(img image.Image) bool {
	if o, ok := img.(interface{ Opaque() bool }); ok {
		return o.Opaque()
	}
	return false
}

// check runs the device's own check on a fitted picture.
func check(b []byte) error {
	_, err := deck.ImageSize(base64.StdEncoding.EncodeToString(b))
	return err
}

// Info is a picture's size and frames, for working out what animates.
func Info(b []byte) (w, h, frames int, err error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil {
		return 0, 0, 0, err
	}
	frames = 1
	if format == "gif" {
		g, err := gif.DecodeAll(bytes.NewReader(b))
		if err != nil {
			return 0, 0, 0, err
		}
		frames = len(g.Image)
	}
	return cfg.Width, cfg.Height, frames, nil
}
