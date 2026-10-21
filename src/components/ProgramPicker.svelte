<!-- The app an "Open app" key opens, picked from a grid; apps the PC helper didn't find on the PC are greyed out. -->
<script lang="ts">
  import { app } from "../lib/context";
  import { brandColours, grouped, keyBackground, loadLogos, type Logo } from "../lib/logos";
  import { found, program, programs, type Program } from "../lib/programs";
  import Icon from "./Icon.svelte";

  let { value, onpick }: { value?: string; onpick: (p: Program) => void } = $props();

  const { device } = app();
  let logos = $state<Logo[]>([]);
  loadLogos()
    .then((l) => (logos = l))
    .catch(() => {});

  let search = $state("");
  let have = $derived(found(device.host));
  let current = $derived(program(value));
  let matches = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return programs.filter((p) => !q || p.title.toLowerCase().includes(q) || p.id.includes(q));
  });
  let groups = $derived(search.trim() ? [{ group: "", logos: matches }] : grouped(matches));
  const logoOf = (p: Program) => (p.logo ? logos.find((l) => l.name === p.logo) : undefined);
  const missing = (p: Program) => !!have && !have.has(p.id);
</script>

<p class="current">
  {#if current}
    Opens {current.title}{#if missing(current)}<span class="bad">, not found on this PC</span>{/if}
  {:else if value}
    Opens “{value}”, which this page doesn't know
  {:else}
    Pick an app
  {/if}
</p>
<div class="picker">
  <input bind:value={search} placeholder="Search, e.g. Spotify" aria-label="Search apps" />
  <div class="grid">
    {#each groups as g (g.group)}
      {#if g.group}<p class="group muted small">{g.group}</p>{/if}
      {#each g.logos as p (p.id)}
        {@const l = logoOf(p)}
        {@const c = l ? brandColours(l.hex) : undefined}
        <button
          type="button"
          class="cell"
          class:on={p.id === value}
          class:missing={missing(p)}
          title={missing(p) ? `${p.title}: not found on this PC` : p.title}
          aria-label={p.title}
          style:color={c?.color ?? "#ffffff"}
          style:background={c?.background ?? keyBackground}
          onclick={() => onpick(p)}
        >
          <Icon name={l?.name ?? p.icon ?? ""} path={l?.d ? { d: l.d, viewBox: l.viewBox! } : undefined} />
        </button>
      {/each}
    {/each}
  </div>
  <p class="muted small">
    {#if !matches.length}Nothing matches.
    {:else if have}Greyed out: not found on this PC.
    {:else}Logos are their makers' trademarks.{/if}
  </p>
</div>

<style>
  .current {
    margin: 0 0 8px;
  }
  .picker {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px;
    margin: 0 0 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 4px;
    max-height: 240px;
    overflow-y: auto;
    margin: 8px 0;
  }
  .cell {
    aspect-ratio: 1;
    padding: 8px;
    border-radius: 6px;
    justify-content: center;
  }
  .cell:hover {
    filter: brightness(1.2);
  }
  .cell.on {
    outline: 2px solid var(--fg);
  }
  .cell.missing {
    filter: grayscale(1);
    opacity: 0.35;
  }
  .grid .group {
    grid-column: 1 / -1;
    margin: 6px 0 0;
  }
  .picker p {
    margin: 0;
  }
</style>
