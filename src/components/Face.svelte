<!-- The device as it looks: its body and key caps, with each key's picture showing through. -->
<script lang="ts">
  import type { Doc } from "../lib/doc.svelte";
  import { face, nextKey, type Direction, type Model } from "../lib/models";
  import KeyView from "./KeyView.svelte";

  let {
    model,
    doc = null,
    down = [],
  }: {
    model: Model;
    doc?: Doc | null; // null: a blank device, as on the start screen
    down?: number[]; // keys held down on the device
  } = $props();

  let f = $derived(face(model));

  // Double-clicking a key does what pressing it on the device does to pages.
  function follow(i: number) {
    if (!doc) return;
    const a = doc.button(i)?.action;
    if (a?.type === "page" && a.page && a.page in (doc.config?.pages ?? {})) doc.openPage(a.page);
    else if (a?.type === "back" && doc.path.length > 1) doc.openPage(doc.path[doc.path.length - 2]);
    else if (a?.type === "home" && doc.config) doc.openPage(doc.config.home);
  }

  // Dragging a key onto another moves it there, swapping the two; with Alt
  // (Option) or Ctrl held, it copies it.
  const dragType = "application/x-d200-key";
  let target = $state<number | null>(null);
  const copying = (e: DragEvent) => e.altKey || e.ctrlKey;

  function dragStart(e: DragEvent, i: number) {
    if (!doc || !e.dataTransfer) return;
    e.dataTransfer.setData(dragType, String(i));
    e.dataTransfer.effectAllowed = "copyMove";
    doc.key = i;
  }

  function dragOver(e: DragEvent, i: number) {
    if (!doc || !e.dataTransfer?.types.includes(dragType)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = copying(e) ? "copy" : "move";
    target = i;
  }

  function drop(e: DragEvent, i: number) {
    target = null;
    if (!doc || !e.dataTransfer?.types.includes(dragType)) return;
    e.preventDefault();
    const from = Number(e.dataTransfer.getData(dragType));
    const copy = copying(e);
    if (copy && doc.button(i) && !confirm(`Replace key ${i + 1} with a copy of key ${from + 1}?`)) return;
    doc.moveKey({ page: doc.page, key: from }, { page: doc.page, key: i }, copy);
    doc.key = i;
  }

  // Arrow keys move between keys, as they sit on the device.
  const arrows: Record<string, Direction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
  let caps: HTMLButtonElement[] = $state([]);
  function arrow(e: KeyboardEvent, i: number) {
    const dir = arrows[e.key];
    if (!doc || !dir) return;
    e.preventDefault();
    const n = nextKey(f.keys, i, dir);
    doc.key = n;
    caps[n]?.focus();
  }

  // percentages of a box, so the face scales with the page
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const radius = (r: number, w: number, h: number) => `${pct(r, w)} / ${pct(r, h)}`;
</script>

<div
  class="body"
  style:aspect-ratio="{f.width} / {f.height}"
  style:border-radius={radius(f.radius, f.width, f.height)}
  style:background-color={f.colour}
  onclick={(e) => e.target === e.currentTarget && doc && (doc.key = null)}
  role="presentation"
>
  {#each f.keys as k, i (i)}
    {@const button = doc?.button(i)}
    <button
      class="cap"
      class:selected={doc?.key === i}
      class:target={target === i}
      class:down={down.includes(i)}
      draggable={!!doc && !!button}
      ondragstart={(e) => dragStart(e, i)}
      ondragover={(e) => dragOver(e, i)}
      ondragleave={() => target === i && (target = null)}
      ondrop={(e) => drop(e, i)}
      ondragend={() => (target = null)}
      disabled={!doc}
      style:left={pct(k.cap.x, f.width)}
      style:top={pct(k.cap.y, f.height)}
      style:width={pct(k.cap.w, f.width)}
      style:height={pct(k.cap.h, f.height)}
      style:border-radius={radius(model.cap.radius, k.cap.w, k.cap.h)}
      bind:this={caps[i]}
      onclick={() => doc && (doc.key = i)}
      onkeydown={(e) => arrow(e, i)}
      ondblclick={() => follow(i)}
      aria-label={button?.label ? `Key ${i + 1}: ${button.label}` : `Key ${i + 1}`}
      aria-pressed={doc?.key === i}
    >
      {#if button}
        <span
          class="picture"
          style:left={pct(k.window.x, k.cap.w)}
          style:top={pct(k.window.y, k.cap.h)}
          style:width={pct(k.window.w, k.cap.w)}
          style:height={pct(k.window.h, k.cap.h)}
          style:border-radius={radius(model.cap.radius - model.cap.out, k.window.w, k.window.h)}
        >
          <KeyView key={i} {button} />
        </span>
      {/if}
    </button>
  {/each}
</div>

<style>
  /* Fixed colours: the device looks the same whatever the page's theme. The
     body's colour comes from its model; the light and the rim are laid over it. */
  .body {
    position: relative;
    width: 100%;
    background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0) 60%);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.07),
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      inset 0 -2px 6px rgba(0, 0, 0, 0.3),
      0 2px 4px var(--shadow),
      0 24px 48px -20px var(--shadow);
  }
  .cap {
    position: absolute;
    padding: 0;
    background: #050505;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      inset 0 -1px 0 rgba(0, 0, 0, 0.7),
      0 1px 0 rgba(255, 255, 255, 0.06),
      0 3px 5px rgba(0, 0, 0, 0.45);
    transition:
      transform 80ms ease-out,
      box-shadow 80ms ease-out;
    overflow: hidden;
  }
  /* the light catching the cap's top edge */
  .cap::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(165deg, rgba(255, 255, 255, 0.09), transparent 38%);
    pointer-events: none;
  }
  .cap:disabled {
    opacity: 1;
    cursor: default;
  }
  .cap:not(:disabled):hover {
    filter: brightness(1.18);
  }
  .cap.down {
    transform: translateY(2px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 1px 2px rgba(0, 0, 0, 0.5);
  }
  .cap.selected {
    outline: 3px solid var(--accent);
    outline-offset: 4px;
    overflow: visible;
  }
  .cap.target {
    outline: 3px dashed var(--accent);
    outline-offset: 4px;
    overflow: visible;
  }
  .picture {
    position: absolute;
    overflow: hidden;
  }
</style>
