<!-- One key's picture, drawn by the device's own code. -->
<script lang="ts">
  import type { Button } from "../lib/config";
  import { app } from "../lib/context";
  import { drawKey } from "../lib/draw";

  let { key, button, on = false }: { key: number; button: Button; on?: boolean } = $props();

  const { doc, deck } = app();
  let canvas: HTMLCanvasElement;
  // bumped when an animated key's next frame is due
  let frame = $state(0);

  $effect(() => {
    void frame;
    const d = deck();
    const ctx = canvas.getContext("2d");
    if (!d || !ctx) return;
    // read the button deeply, so any edit to it redraws
    const b = JSON.parse(JSON.stringify(button)) as Button;
    const px = drawKey(d, doc, key, b, on);
    if (!px) return;
    canvas.width = px.width;
    canvas.height = px.height;
    ctx.putImageData(new ImageData(px.data, px.width, px.height), 0, 0);
    if (!px.next) return;
    const t = setTimeout(() => frame++, Math.max(20, px.next - Date.now()));
    return () => clearTimeout(t);
  });
</script>

<canvas bind:this={canvas}></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: #000;
  }
</style>
