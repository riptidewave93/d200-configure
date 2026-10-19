package fit

import (
	"bytes"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"math"
	"math/rand/v2"
	"testing"

	"github.com/riptidewave93/d200-deck/deck"
)

var imageBox = Box{Width: 196, Height: 196, Bytes: deck.MaxImageBytes}
var iconBox = Box{Width: 120, Height: 120, Bytes: deck.MaxIconBytes}

func pngOf(img image.Image) []byte {
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}

// photo is a busy opaque picture that compresses badly as PNG.
func photo(w, h int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	r := rand.New(rand.NewPCG(1, 2))
	for y := range h {
		for x := range w {
			img.Set(x, y, color.RGBA{uint8(x*255/w + r.IntN(40)), uint8(y*255/h + r.IntN(40)), uint8(r.IntN(255)), 255})
		}
	}
	return img
}

// spinner is an animated GIF: a dot going round on a transparent background.
func spinner(side, frames int) []byte {
	pal := color.Palette{color.RGBA{}, color.RGBA{255, 200, 0, 255}, color.RGBA{30, 120, 255, 255}}
	g := &gif.GIF{Config: image.Config{ColorModel: pal, Width: side, Height: side}}
	for i := range frames {
		p := image.NewPaletted(image.Rect(0, 0, side, side), pal)
		cx := side/2 + int(float64(side/3)*cos(i, frames))
		cy := side/2 + int(float64(side/3)*sin(i, frames))
		for y := range side {
			for x := range side {
				if (x-cx)*(x-cx)+(y-cy)*(y-cy) < side*side/64 {
					p.SetColorIndex(x, y, 1+uint8(i%2))
				}
			}
		}
		g.Image = append(g.Image, p)
		g.Delay = append(g.Delay, 4)
		g.Disposal = append(g.Disposal, gif.DisposalBackground)
	}
	var buf bytes.Buffer
	if err := gif.EncodeAll(&buf, g); err != nil {
		panic(err)
	}
	return buf.Bytes()
}

func TestKeepsWhatFits(t *testing.T) {
	small := pngOf(photo(64, 64))
	p, err := Fit(small, imageBox)
	if err != nil || p.Changed || !bytes.Equal(p.Data, small) {
		t.Fatalf("a picture that fits was changed: %v %+v", err, p.Changed)
	}
	g := spinner(96, 20)
	p, err = Fit(g, iconBox)
	if err != nil || p.Changed || p.Frames != 20 {
		t.Fatalf("a GIF that fits was changed: %v %+v", err, p)
	}
}

func TestShrinksABigPhoto(t *testing.T) {
	p, err := Fit(pngOf(photo(1200, 800)), imageBox)
	if err != nil {
		t.Fatal(err)
	}
	if p.Width != 196 || p.Height != 131 || len(p.Data) > imageBox.Bytes {
		t.Fatalf("got %dx%d, %d bytes", p.Width, p.Height, len(p.Data))
	}
	// a busy picture as an icon only fits in 24 KiB as a JPEG
	p, err = Fit(pngOf(photo(500, 500)), iconBox)
	if err != nil {
		t.Fatal(err)
	}
	if p.Width > 120 || len(p.Data) > iconBox.Bytes {
		t.Fatalf("icon: got %dx%d, %d bytes", p.Width, p.Height, len(p.Data))
	}
}

func TestKeepsTransparency(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 400, 400))
	for y := 100; y < 300; y++ {
		for x := 100; x < 300; x++ {
			img.Set(x, y, color.NRGBA{200, 0, 0, 255})
		}
	}
	p, err := Fit(pngOf(img), iconBox)
	if err != nil {
		t.Fatal(err)
	}
	out, _ := png.Decode(bytes.NewReader(p.Data))
	if _, _, _, a := out.At(2, 2).RGBA(); a != 0 {
		t.Fatal("the corner should stay transparent")
	}
	if r, _, _, a := out.At(60, 60).RGBA(); a == 0 || r < 0x8000 {
		t.Fatal("the middle should stay red")
	}
}

func TestFitsAnAnimation(t *testing.T) {
	// a Discord-sized emoji, more frames than the device takes
	p, err := Fit(spinner(128, 150), iconBox)
	if err != nil {
		t.Fatal(err)
	}
	if p.Width != 120 || p.Frames > deck.MaxFrames || p.Frames+p.Dropped != 150 || len(p.Data) > iconBox.Bytes {
		t.Fatalf("got %+v, %d bytes", p, len(p.Data))
	}
	g, err := gif.DecodeAll(bytes.NewReader(p.Data))
	if err != nil {
		t.Fatal(err)
	}
	total := 0
	for _, d := range g.Delay {
		total += d
	}
	if total != 150*4 {
		t.Fatalf("it should play as long as before: %d cs, not %d", total, 150*4)
	}
}

func TestKeepsAnimationsMoving(t *testing.T) {
	// a small GIF that fits as a file, but drawn across a key it has more
	// frame pixels than the device animates
	p, err := Fit(spinner(64, 80), imageBox)
	if err != nil {
		t.Fatal(err)
	}
	if !p.Changed || p.Frames*196*196 > MaxAnimPixels || p.Frames+p.Dropped != 80 {
		t.Fatalf("got %+v", p)
	}
	// at icon size it moves as it is
	if p, _ := Fit(spinner(64, 80), iconBox); p.Changed {
		t.Fatalf("as an icon it should stay as it is: %+v", p)
	}
}

func TestStoredChangesPlayBack(t *testing.T) {
	// only changed pixels are stored, so play the result back and compare
	// each frame with the original's, scaled
	src := spinner(200, 30)
	p, err := Fit(src, imageBox)
	if err != nil {
		t.Fatal(err)
	}
	orig, _ := gif.DecodeAll(bytes.NewReader(src))
	out, _ := gif.DecodeAll(bytes.NewReader(p.Data))
	want, _ := composite(orig)
	got, _ := composite(out)
	if len(got) != len(want) {
		t.Fatalf("%d frames, want %d", len(got), len(want))
	}
	for i := range got {
		w := resize(want[i], p.Width, p.Height)
		bad := 0
		for j := 0; j < len(w.Pix); j += 4 {
			if (w.Pix[j+3] >= 128) != (got[i].Pix[j+3] >= 128) {
				bad++
			}
		}
		if bad > len(w.Pix)/4/100 { // edges may round either way
			t.Fatalf("frame %d: %d pixels differ", i, bad)
		}
	}
}

func TestCutsFramesForBytes(t *testing.T) {
	// a noisy animation is too big at full size: frames go before size
	pal := color.Palette{color.RGBA{}}
	r := rand.New(rand.NewPCG(3, 4))
	for range 255 {
		pal = append(pal, color.RGBA{uint8(r.IntN(256)), uint8(r.IntN(256)), uint8(r.IntN(256)), 255})
	}
	g := &gif.GIF{Config: image.Config{ColorModel: pal, Width: 196, Height: 196}}
	for range 40 {
		f := image.NewPaletted(image.Rect(0, 0, 196, 196), pal)
		for j := range f.Pix {
			f.Pix[j] = uint8(1 + r.IntN(255))
		}
		g.Image = append(g.Image, f)
		g.Delay = append(g.Delay, 5)
	}
	var buf bytes.Buffer
	gif.EncodeAll(&buf, g)
	p, err := Fit(buf.Bytes(), imageBox)
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Data) > imageBox.Bytes || p.Dropped == 0 {
		t.Fatalf("got %+v, %d bytes", p, len(p.Data))
	}
}

func TestRefusesWhatIsntAPicture(t *testing.T) {
	if _, err := Fit([]byte("not a picture"), imageBox); err == nil {
		t.Fatal("no error")
	}
}

func cos(i, n int) float64 { return math.Cos(2 * math.Pi * float64(i) / float64(n)) }
func sin(i, n int) float64 { return math.Sin(2 * math.Pi * float64(i) / float64(n)) }
