<!-- The page shown, when no key is selected: its name, which keys open it, home, meeting keys and delete. -->
<script lang="ts">
  import { app } from "../lib/context";
  import type { Doc } from "../lib/doc.svelte";
  import { loadLogos } from "../lib/logos";
  import { fillPage, forPage, meetingApps } from "../lib/meetings";

  let { doc }: { doc: Doc } = $props();
  const { model, features } = app();
  // the mic app isn't a page of its own; it joins the others' pages
  const pageApps = meetingApps.filter((m) => m.id !== "mic");

  let name = $state("");
  let input: HTMLInputElement;
  $effect(() => {
    name = doc.page;
  });
  // a new page: ready for its name to be typed
  $effect(() => {
    if (!doc.naming) return;
    doc.naming = false;
    input.focus();
    input.select();
  });
  let error = $derived(name === doc.page ? "" : doc.pageNameError(name));
  let openers = $derived(doc.keysOpening(doc.page).filter((o) => o.page !== doc.page));
  let home = $derived(doc.page === doc.config?.home);

  function rename() {
    if (name === doc.page) return;
    if (error) {
      name = doc.page;
      return;
    }
    doc.renamePage(doc.page, name);
  }

  let full = $state("");
  async function fill(id: string) {
    const logos = await loadLogos().catch(() => []);
    full = fillPage(doc.config!, doc.page, model().windows.length, forPage(id, features()), logos) ? "" : "No empty keys, or they're all here already.";
  }

  function remove() {
    const n = doc.keysOpening(doc.page).length;
    const also = n ? (n === 1 ? " The key that opens it will be cleared." : ` The ${n} keys that open it will be cleared.`) : "";
    if (confirm(`Delete the page "${doc.page}"?${also}`)) doc.deletePage(doc.page);
  }
</script>

<section class="panel" aria-label="Page">
  <label>
    <span>Page name</span>
    <input
      bind:this={input}
      bind:value={name}
      onblur={rename}
      onkeydown={(e) => {
        if (e.key === "Enter") rename();
        if (e.key === "Escape") name = doc.page;
      }}
    />
  </label>
  {#if error}<p class="bad small">{error}</p>{/if}

  <h3>Opened by</h3>
  {#if home}
    <p class="muted">Shown when the device starts.</p>
  {/if}
  {#if openers.length}
    <ul>
      {#each openers as o (`${o.page}/${o.key}`)}
        <li>
          <button
            class="plain"
            onclick={() => {
              doc.openPage(o.page);
              doc.key = o.key;
            }}>{o.page}, key {o.key + 1}</button
          >
        </li>
      {/each}
    </ul>
  {:else if !home}
    <p class="muted">Set a key to Open page to reach it.</p>
  {/if}

  <div class="row actions">
    {#if !home}
      <button class="plain" onclick={() => (doc.config!.home = doc.page)}>Show at start</button>
    {/if}
    {#each pageApps as m (m.id)}
      <button class="plain" title="Put {m.title}'s shortcuts on the empty keys" onclick={() => fill(m.id)}>+ {m.title}</button>
    {/each}
    {#if !home}
      <span class="grow"></span>
      <button class="quiet danger" onclick={remove}>Delete page</button>
    {/if}
  </div>
  {#if full}<p class="muted small">{full}</p>{/if}
</section>

<style>
  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 18px 20px 14px;
  }
  h3 {
    margin: 4px 0 6px;
    font-size: 13px;
    color: var(--muted);
    font-weight: 400;
  }
  ul {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
  }
  li button {
    padding: 3px 0;
  }
  .actions {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .danger:hover:not(:disabled) {
    color: var(--bad);
  }
</style>
