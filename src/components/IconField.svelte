<!-- A key's icon: a built-in one by name, an emoji, or a picture, picked from a searchable grid. -->
<script lang="ts">
  import { app } from "../lib/context";
  import { emojiChar, emojis, search as searchEmoji, type Emoji } from "../lib/emoji";
  import { dataURL } from "../lib/pictures";
  import Icon from "./Icon.svelte";

  // onpicture asks for a picture from a file
  let {
    value,
    onchange,
    onemoji,
    onpicture,
  }: {
    value?: string;
    onchange: (name: string) => void;
    onemoji?: (e: Emoji) => void;
    onpicture?: () => void;
  } = $props();

  const { deck, doc } = app();
  // enough to scan at a glance; searching narrows the rest
  const shown = 120;
  // what the picker opens on, before a search
  const common = [
    "play-pause", "play_arrow", "pause", "stop", "next", "prev", "volume_up", "volume_down", "mute", "mic",
    "mic_off", "headphones", "music_note", "globe", "home", "back", "refresh", "search", "folder", "mail",
    "chat", "code", "terminal", "keyboard", "settings", "power", "bedtime", "lock", "lightbulb", "star",
    "timer", "videocam", "screen_share", "fiber_manual_record", "discord", "obs",
  ];

  let open = $state(false);
  let tab = $state<"icons" | "emoji" | "pictures">("icons");
  let search = $state("");
  let allEmoji = $state<Emoji[]>([]);
  let emojiError = $state("");

  let emoji = $derived(emojiChar(value));
  // a picture icon in the config (an emoji is one too, shown as itself)
  let picture = $derived(!emoji && value ? doc.config?.icons?.[value]?.png : undefined);
  let pictures = $derived(
    Object.entries(doc.config?.icons ?? {})
      .filter(([n, i]) => i.png && !emojiChar(n))
      .map(([n, i]) => ({ name: n, src: dataURL(i.png!) })),
  );
  let iconMatches = $derived.by(() => {
    const all = deck()?.icons ?? [];
    const q = search.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!q) return common.filter((n) => deck()?.hasIcon(n));
    // exact match first, then names that start with it, then the rest
    const rank = (n: string) => (n === q ? 0 : n.startsWith(q) ? 1 : 2);
    return all
      .map((n) => ({ n, key: n.replace(/-/g, "_") }))
      .filter(({ key }) => key.includes(q))
      .sort((a, b) => rank(a.key) - rank(b.key))
      .map(({ n }) => n);
  });
  let emojiMatches = $derived(searchEmoji(allEmoji, search));
  let matches = $derived(
    tab === "icons" ? iconMatches.length : tab === "emoji" ? emojiMatches.length : pictures.length,
  );
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
    {#if emoji || picture || (value && !unknown)}
      <span class="current" aria-hidden="true">
        {#if emoji}<span class="emoji">{emoji}</span>
        {:else if picture}<img src={dataURL(picture)} alt="" />
        {:else}<Icon name={value!} />{/if}
      </span>
    {/if}
    {#if emoji || picture}
      <span class="grow emoji-name">{emoji ? "Emoji" : value}</span>
      <button type="button" class="quiet" onclick={() => onchange("")}>Remove</button>
    {:else}
      <input
        class="grow"
        placeholder="e.g. home"
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
        {#if onpicture}
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pictures"}
            class:on={tab === "pictures"}
            onclick={() => (tab = "pictures")}>Pictures</button
          >
        {/if}
      </div>
    {/if}
    {#if tab === "pictures"}
      <button
        type="button"
        class="plain"
        onclick={() => {
          onpicture?.();
          open = false;
        }}>Add from file…</button
      >
    {:else}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={search}
        placeholder={tab === "icons" ? "Search, e.g. volume" : "Search, e.g. game"}
        aria-label="Search"
        autofocus
      />
    {/if}
    <div class="grid">
      {#if tab === "icons"}
        {#each iconMatches.slice(0, shown) as name (name)}
          <button type="button" class="cell" class:on={name === value} title={name} onclick={() => pickIcon(name)}>
            <Icon {name} />
          </button>
        {/each}
      {:else if tab === "pictures"}
        {#each pictures as p (p.name)}
          <button type="button" class="cell" class:on={p.name === value} title={p.name} onclick={() => pickIcon(p.name)}>
            <img src={p.src} alt={p.name} />
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
      {#if tab === "pictures"}A PNG, JPEG or GIF, made smaller to fit if it must. GIFs move on the device.
      {:else if emojiError && tab === "emoji"}{emojiError}
      {:else if tab === "emoji" && !allEmoji.length}Loading…
      {:else if tab === "icons" && !search.trim()}Common icons. Search to find more.
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
  .current img,
  .cell img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .emoji-name {
    color: var(--muted);
  }
  .picker {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px;
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
