<!-- The device's face: its keys where they sit on the device, for the page shown. -->
<script lang="ts">
  import type { Doc } from "../lib/doc.svelte";
  import type { Layout } from "../lib/layout";
  import KeyView from "./KeyView.svelte";

  let { doc, layout }: { doc: Doc; layout: Layout } = $props();

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
</script>

<div class="face" style:aspect-ratio="{layout.width} / {layout.height}">
  {#each layout.keys as r, i (i)}
    <button
      class="key"
      class:selected={doc.key === i}
      style:left={pct(r.x, layout.width)}
      style:top={pct(r.y, layout.height)}
      style:width={pct(r.w, layout.width)}
      style:height={pct(r.h, layout.height)}
      onclick={() => (doc.key = doc.key === i ? null : i)}
      aria-label="Key {i + 1}"
    >
      <KeyView key={i} button={doc.button(i)} />
    </button>
  {/each}
</div>

<style>
  .face {
    position: relative;
    width: 100%;
    background: var(--face);
    border-radius: 16px;
    container-type: inline-size;
  }
  .key {
    position: absolute;
    padding: 0;
    border-radius: 6%;
    overflow: hidden;
    background: none;
    outline: 2px solid transparent;
    outline-offset: 3px;
  }
  .key.selected {
    outline-color: var(--accent);
  }
</style>
