<!-- The config's pages as tabs, and adding, renaming and deleting them. -->
<script lang="ts">
  import type { Doc } from "../lib/doc.svelte";

  let { doc }: { doc: Doc } = $props();

  // "add" or the page being renamed, while the name box is open
  let editing = $state<string | null>(null);
  let name = $state("");
  let error = $derived(editing === null || name === editing ? "" : doc.pageNameError(name));

  function start(what: string) {
    editing = what;
    name = what === "add" ? "" : what;
  }

  function done() {
    if (error || editing === null) return;
    if (editing === "add") doc.addPage(name);
    else doc.renamePage(editing, name);
    editing = null;
  }

  function remove() {
    const page = doc.page;
    const n = doc.keysOpening(page).length;
    const also = n ? ` The ${n === 1 ? "key" : `${n} keys`} that open it will be cleared.` : "";
    if (confirm(`Delete the page "${page}"?${also}`)) doc.deletePage(page);
  }
</script>

<div class="bar">
  <div class="tabs" role="tablist" aria-label="Pages">
    {#each doc.pages as p (p)}
      <button
        role="tab"
        class="tab"
        class:on={p === doc.page}
        aria-selected={p === doc.page}
        onclick={() => {
          doc.page = p;
          doc.key = null;
        }}
      >
        {p}{#if p === doc.config?.home}<span class="home" title="Shown when the device starts">{" "}home</span>{/if}
      </button>
    {/each}
    <button class="quiet add" onclick={() => start("add")} title="Add a page">+ Page</button>
  </div>

  {#if editing !== null}
    <form
      class="row edit"
      onsubmit={(e) => {
        e.preventDefault();
        done();
      }}
    >
      <!-- svelte-ignore a11y_autofocus -->
      <input class="grow" bind:value={name} placeholder="Page name" aria-label="Page name" autofocus />
      <button disabled={!!error}>{editing === "add" ? "Add" : "Rename"}</button>
      <button type="button" class="quiet" onclick={() => (editing = null)}>Cancel</button>
    </form>
    {#if error && name}<p class="bad small">{error}</p>{/if}
  {:else}
    <div class="row actions small">
      <button class="quiet" onclick={() => start(doc.page)}>Rename page</button>
      {#if doc.page !== doc.config?.home}
        <button class="quiet" onclick={() => (doc.config!.home = doc.page)}>Show at start</button>
        <button class="quiet" onclick={remove}>Delete page</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .tab {
    background: none;
    color: var(--muted);
    font-weight: 400;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 14px;
  }
  .tab:hover {
    color: var(--fg);
  }
  .tab.on {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }
  .home {
    opacity: 0.6;
    font-size: 12px;
  }
  .edit {
    margin-top: 10px;
    max-width: 420px;
  }
  .actions {
    margin-top: 2px;
    gap: 4px;
  }
</style>
