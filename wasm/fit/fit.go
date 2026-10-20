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
	"github.com/riptidewave93/d200-deck/render"
)

// Box is the most a picture can be: its size on the device, its bytes, and
// for an animated GIF what it may take of the page's animation budget.
type Box struct {
	Width, Height int
	Bytes         int
	Anim          Anim
}

// Anim is animation budget: Bytes in all, frames kept PerPixel bytes a
// pixel at the size drawn. Devices that report anim_bytes keep a byte a
// pixel, plus a palette; older ones 4 (OldAnim).
type Anim struct{ Bytes, PerPixel int }

// OldAnim is the budget of a page on devices that don't report anim_bytes.
var OldAnim = Anim{Bytes: 4 * MaxAnimPixels, PerPixel: 4}

// What a fitted GIF takes on devices that keep a byte a pixel: its colours
// fit one palette.
const paletteBytes = 4 * 256

// cost is what frames of w x h take on the device, drawn to fit the box.
func (box Box) cost(frames, w, h int) int {
	dw, dh := render.FitSize(w, h, box.Width, box.Height)
	if box.Anim.PerPixel == 1 {
		return frames*dw*dh + paletteBytes
	}
	return frames * dw * dh * box.Anim.PerPixel
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

// MaxAnimPixels is what devices without anim_bytes animate on a page, in
// frame pixels at the size drawn, 4 bytes each; past their budget, GIFs
// show their first frame. A fitted GIF stays within its budget, so it moves.
const MaxAnimPixels = render.MaxAnimPixels

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

// animated fits an animated GIF: scaled, with fewer frames if it has too
// many (see pick), and only what changes stored for each frame. The device
// scales frames up to fill the box, so only fewer frames save animation
// budget.
func animated(b []byte, g *gif.GIF, box Box) (Picture, error) {
	w0, h0 := g.Config.Width, g.Config.Height
	frames, delays := composite(g)
	n := len(frames)
	thumbs := make([][]uint8, n)
	for i, f := range frames {
		thumbs[i] = resize(f, thumbSide, thumbSide).Pix
	}
	tooMany := func(frames, w, h int) bool {
		return frames > deck.MaxFrames || frames*w*h > deck.MaxGIFPixels || box.cost(frames, w, h) > box.Anim.Bytes
	}
	step := 1
	fits := n <= deck.MaxFrames && n*w0*h0 <= deck.MaxGIFPixels && animBytes(b, n, w0, h0, box) <= box.Anim.Bytes
	if w0 <= box.Width && h0 <= box.Height && len(b) <= box.Bytes && fits {
		return Picture{Data: b, Width: w0, Height: h0, Frames: n}, check(b)
	}
	for s := scale(w0, h0, box); ; {
		w, h := size(w0, h0, s)
		if w < minSide && h < minSide {
			return Picture{}, errTooBig
		}
		for kept(n, step) > 1 && tooMany(kept(n, step), w, h) {
			step++
		}
		k := kept(n, step)
		keep, times := pick(thumbs, delays, k)
		out := encodeGIF(frames, keep, times, w, h, g.LoopCount)
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

// animBytes is what GIF b, of n frames w x h, takes on the device as it is.
func animBytes(b []byte, n, w, h int, box Box) int {
	if box.Anim.PerPixel == 1 {
		return render.AnimBytes(base64.StdEncoding.EncodeToString(b), box.Width, box.Height)
	}
	return box.cost(n, w, h)
}

// AnimBytes is what GIF data (base64) drawn to fit w x h takes of a page's
// animation budget, kept perPixel bytes a pixel; 0 if it's still.
func AnimBytes(data string, w, h, perPixel int) int {
	if perPixel == 1 {
		return render.AnimBytes(data, w, h)
	}
	b, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return 0
	}
	gw, gh, n, err := Info(b)
	if err != nil || n < 2 {
		return 0
	}
	return Box{Width: w, Height: h, Anim: Anim{PerPixel: perPixel}}.cost(n, gw, gh)
}

// The side of the thumbnails frames are compared by, and how unlike two
// thumbnails must be, on average per colour channel, to look different.
const (
	thumbSide = 16
	stillDiff = 2
)

// pick chooses k of the frames to keep. The frames are split into k runs of
// about equal length; each run gives the frame that looks most unlike the
// one kept before it, and shows for the whole run. So a GIF that flips
// between two poses every frame, like a clap, keeps both poses.
func pick(thumbs [][]uint8, delays []int, k int) (keep, times []int) {
	n := len(thumbs)
	diff := func(a, b int) int {
		d := 0
		for j := range thumbs[a] {
			d += abs(int(thumbs[a][j]) - int(thumbs[b][j]))
		}
		return d
	}
	unlike := func(lo, hi, ref int) int {
		best := lo
		for i := lo + 1; i < hi; i++ {
			if diff(i, ref) > diff(best, ref) {
				best = i
			}
		}
		return best
	}
	run := func(r int) (int, int) { return r * n / k, (r + 1) * n / k }
	for r := range k {
		lo, hi := run(r)
		i := lo // the first frame stays first
		if r > 0 {
			i = unlike(lo, hi, keep[r-1])
		}
		t := 0
		for _, d := range delays[lo:hi] {
			t += d
		}
		keep, times = append(keep, i), append(times, t)
	}
	// all the movement was in the first run: show it there
	if k > 1 && !moves(keep, diff) {
		lo, hi := run(0)
		keep[0] = unlike(lo, hi, keep[1])
	}
	return keep, times
}

// moves says whether any of the frames looks different from the first.
func moves(frames []int, diff func(a, b int) int) bool {
	for _, i := range frames[1:] {
		if diff(frames[0], i) > stillDiff*thumbSide*thumbSide*4 {
			return true
		}
	}
	return false
}

func abs(x int) int { return max(x, -x) }

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

// encodeGIF scales the frames in keep to w x h and encodes them with one
// palette, each shown for its time. Each frame stores only the pixels that change, unless something
// turns transparent: then the frame before it is cleared and it's stored whole.
func encodeGIF(frames []*image.RGBA, keep, times []int, w, h, loop int) []byte {
	small := make([]*image.RGBA, len(keep))
	for i, f := range keep {
		small[i] = resize(frames[f], w, h)
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
