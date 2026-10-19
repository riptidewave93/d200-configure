<!-- A key's icon: a built-in one by name, or an emoji, picked from a searchable grid. -->
<script lang="ts">
  import { app } from "../lib/context";
  import { emojiChar, emojis, search as searchEmoji, type Emoji } from "../lib/emoji";
  import Icon from "./Icon.svelte";

  let {
    value,
    onchange,
    onemoji,
  }: { value?: string; onchange: (name: string) => void; onemoji?: (e: Emoji) => void } = $props();

  const { deck, doc } = app();
  // enough to scan at a glance; searching narrows the rest
  const shown = 120;

  let open = $state(false);
  let tab = $state<"icons" | "emoji">("icons");
  let search = $state("");
  let allEmoji = $state<Emoji[]>([]);
  let emojiError = $state("");

  let emoji = $derived(emojiChar(value));
  let iconMatches = $derived.by(() => {
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
  let emojiMatches = $derived(searchEmoji(allEmoji, search));
  let matches = $derived(tab === "icons" ? iconMatches.length : emojiMatches.length);
  let unknown = $derived(
    !!value && !emoji && !!deck() && !deck()!.hasIcon(value) && !(value in (doc.config?.icons ?? {})),
  );

  async function showEmoji() {
    tab = "emoji";
    if (allEmoji.length) return;
    try {
      allEmoji = await emojis();
    } catch {
      emojiError = "The emoji list didn't load.";
    }
  }

  function pickIcon(name: string) {
    onchange(name);
    open = false;
  }

  function pickEmoji(e: Emoji) {
    onemoji?.(e);
    open = false;
  }
</script>

<label>
  <span>Icon</span>
  <div class="row">
    <span class="current" aria-hidden="true">
      {#if emoji}<span class="emoji">{emoji}</span>{:else if value && !unknown}<Icon name={value} />{/if}
    </span>
    {#if emoji}
      <span class="grow emoji-name">Emoji</span>
      <button type="button" class="quiet" onclick={() => onchange("")}>Remove</button>
    {:else}
      <input
        class="grow"
        placeholder="None"
        value={value ?? ""}
        onchange={(e) => onchange(e.currentTarget.value.trim())}
        aria-label="Icon name"
      />
    {/if}
    <button type="button" class="plain" onclick={() => (open = !open)}>{open ? "Close" : "Pick"}</button>
  </div>
</label>
{#if unknown}<p class="bad small">No icon by that name.</p>{/if}

{#if open}
  <div class="picker">
    {#if onemoji}
      <div class="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "icons"} class:on={tab === "icons"} onclick={() => (tab = "icons")}
          >Icons</button
        >
        <button type="button" role="tab" aria-selected={tab === "emoji"} class:on={tab === "emoji"} onclick={showEmoji}
          >Emoji</button
        >
      </div>
    {/if}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={search}
      placeholder={tab === "icons" ? "Search, e.g. volume" : "Search, e.g. game"}
      aria-label="Search"
      autofocus
    />
    <div class="grid">
      {#if tab === "icons"}
        {#each iconMatches.slice(0, shown) as name (name)}
          <button type="button" class="cell" class:on={name === value} title={name} onclick={() => pickIcon(name)}>
            <Icon {name} />
          </button>
        {/each}
      {:else}
        {#each emojiMatches.slice(0, shown) as e (e.hex)}
          <button type="button" class="cell emoji" class:on={e.char === emoji} title={e.name} onclick={() => pickEmoji(e)}>
            {e.char}
          </button>
        {/each}
      {/if}
    </div>
    <p class="muted small">
      {#if emojiError && tab === "emoji"}{emojiError}
      {:else if tab === "emoji" && !allEmoji.length}Loading…
      {:else if matches > shown}{shown} of {matches}. Search to find more.
      {:else if !matches}Nothing matches.
      {:else if tab === "emoji"}Emoji are saved as small pictures, drawn by this computer.{/if}
    </p>
  </div>
{/if}

<style>
  .current {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
  }
  .emoji {
    font-size: 26px;
    line-height: 1;
  }
  .emoji-name {
    color: var(--muted);
  }
  .picker {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px;
    margin: -4px 0 14px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
  }
  .tabs button {
    background: none;
    color: var(--muted);
    font-weight: 400;
    padding: 4px 12px;
    border-radius: 999px;
  }
  .tabs button.on {
    background: var(--fg);
    color: var(--bg);
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
    justify-content: center;
  }
  .cell.emoji {
    font-size: 24px;
    padding: 0;
    font-weight: 400;
  }
  .cell:hover,
  .cell.on {
    background: var(--line);
  }
  .picker p {
    margin: 0;
  }
</style>
