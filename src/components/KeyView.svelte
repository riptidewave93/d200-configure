<!-- One key, drawn by the device's own code. A key without a button is black, as on the device. -->
<script lang="ts">
  import type { Button } from "../lib/config";
  import { app } from "../lib/context";
  import { drawKey } from "../lib/draw";

  let { key, button, on = false }: { key: number; button?: Button; on?: boolean } = $props();

  const { doc, deck } = app();
  let canvas: HTMLCanvasElement;

  $effect(() => {
    const d = deck();
    const ctx = canvas.getContext("2d");
    if (!d || !ctx) return;
    if (!button) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    // read the button deeply, so any edit to it redraws
    const b = JSON.parse(JSON.stringify(button)) as Button;
    const px = drawKey(d, doc, key, b, on);
    if (!px) return;
    canvas.width = px.width;
    canvas.height = px.height;
    ctx.putImageData(new ImageData(px.data, px.width, px.height), 0, 0);
  });
</script>

<canvas bind:this={canvas} class:empty={!button}></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: #000;
  }
  canvas.empty {
    outline: 1px dashed #333;
    outline-offset: -1px;
  }
</style>
