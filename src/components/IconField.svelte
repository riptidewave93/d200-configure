<!-- A built-in icon: typed by name, or picked from a searchable grid. -->
<script lang="ts">
  import { app } from "../lib/context";
  import Icon from "./Icon.svelte";

  let { value, onchange }: { value?: string; onchange: (name: string) => void } = $props();

  const { deck } = app();
  // enough to scan at a glance; searching narrows the rest
  const shown = 120;

  let open = $state(false);
  let search = $state("");
  let matches = $derived.by(() => {
    const all = deck()?.icons ?? [];
    const q = search.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!q) return all;
    // exact match first, then names that start with it, then the rest
    const rank = (n: string) => (n === q ? 0 : n.startsWith(q) ? 1 : 2);
    return all
      .map((n) => ({ n, key: n.replace(/-/g, "_") }))
      .filter(({ key }) => key.includes(q))
      .sort((a, b) => rank(a.key) - rank(b.key))
      .map(({ n }) => n);
  });
  let unknown = $derived(!!value && !!deck() && !deck()!.hasIcon(value));

  function pick(name: string) {
    onchange(name);
    open = false;
  }
</script>

<label>
  <span>Icon</span>
  <div class="row">
    <span class="current" aria-hidden="true">{#if value && !unknown}<Icon name={value} />{/if}</span>
    <input
      class="grow"
      placeholder="None"
      value={value ?? ""}
      onchange={(e) => onchange(e.currentTarget.value.trim())}
      aria-label="Icon name"
    />
    <button type="button" class="plain" onclick={() => (open = !open)}>{open ? "Close" : "Pick"}</button>
  </div>
</label>
{#if unknown}<p class="bad">No icon by that name.</p>{/if}

{#if open}
  <div class="picker">
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={search} placeholder="Search, e.g. volume" aria-label="Search icons" autofocus />
    <div class="grid">
      {#each matches.slice(0, shown) as name (name)}
        <button type="button" class="cell" class:on={name === value} title={name} onclick={() => pick(name)}>
          <Icon {name} />
        </button>
      {/each}
    </div>
    <p class="muted">
      {#if matches.length > shown}{shown} of {matches.length}. Search to find more.{:else if !matches.length}No
        icons match.{/if}
    </p>
  </div>
{/if}

<style>
  .current {
    width: 32px;
    height: 32px;
    flex: none;
  }
  .picker {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px;
    margin: -4px 0 12px;
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
    padding: 6px;
    background: none;
    color: var(--fg);
    border-radius: 6px;
  }
  .cell:hover,
  .cell.on {
    background: var(--line);
  }
  .picker p {
    margin: 0;
    font-size: 14px;
  }
</style>
