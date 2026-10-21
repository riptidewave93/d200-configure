// genicons writes the icon catalog the site offers, from d200-deck's icons
// package, as JSON: each icon's path data by name, with its viewBox where
// it isn't the Material Symbols one. Run by `make icons`; the output is kept
// in git.
//
//	go run ./genicons <d200-deck version> > ../src/lib/icons.json
package main

import (
	"bytes"
	"encoding/json"
	"log"
	"os"

	"github.com/riptidewave93/d200-deck/icons"
)

const symbolBox = "0 -960 960 960"

func main() {
	if len(os.Args) != 2 {
		log.Fatal("usage: genicons <d200-deck version>")
	}
	type icon struct {
		D       string `json:"d"`
		ViewBox string `json:"viewBox,omitempty"`
	}
	out := struct {
		Source  string         `json:"source"`
		ViewBox string         `json:"viewBox"`
		Icons   map[string]any `json:"icons"` // path data, or an icon with its own viewBox
	}{"d200-deck icons " + os.Args[1], symbolBox, map[string]any{}}
	for _, n := range icons.Names() {
		ic, ok := icons.Get(n)
		if !ok || ic.D == "" {
			log.Fatalf("%s: no path", n)
		}
		if ic.ViewBox == symbolBox {
			out.Icons[n] = ic.D
		} else {
			out.Icons[n] = icon{ic.D, ic.ViewBox}
		}
	}
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(out); err != nil {
		log.Fatal(err)
	}
	os.Stdout.Write(b.Bytes())
}
