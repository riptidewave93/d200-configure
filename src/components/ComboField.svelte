<!-- A key combo: typed as "ctrl + shift + m", or recorded by pressing it. -->
<script lang="ts">
  import { formatCombo, keyName, ordered, parseCombo } from "../lib/keys";

  let { keys, onchange, known }: { keys?: string[]; onchange: (k: string[]) => void; known: Set<string> } = $props();

  let recording = $state(false);
  let held: string[] = [];
  let text = $state("");
  $effect(() => {
    text = formatCombo(keys);
  });

  let unknown = $derived(parseCombo(text).filter((k) => known.size && !known.has(k)));

  function keydown(e: KeyboardEvent) {
    if (!recording) return;
    e.preventDefault();
    const k = keyName(e.code);
    if (k && !held.includes(k)) held.push(k);
    text = formatCombo(ordered(held));
  }

  function keyup(e: KeyboardEvent) {
    if (!recording) return;
    e.preventDefault();
    // done when the last key is let go
    if (!e.getModifierState("Control") && !e.getModifierState("Shift") && !e.getModifierState("Alt") && !e.getModifierState("Meta")) {
      recording = false;
      onchange(ordered(held));
    }
  }
</script>

<div class="row">
  <input
    class="grow"
    bind:value={text}
    onchange={() => onchange(parseCombo(text))}
    onkeydown={keydown}
    onkeyup={keyup}
    onblur={() => (recording = false)}
    placeholder={recording ? "Press the keys" : "ctrl + shift + m"}
    readonly={recording}
    aria-label="Key combo"
  />
  <button
    type="button"
    onclick={(e) => {
      held = [];
      text = "";
      recording = true;
      (e.currentTarget.previousElementSibling as HTMLInputElement).focus();
    }}>{recording ? "Recording…" : "Record"}</button
  >
</div>
{#if unknown.length}<p class="bad">Unknown {unknown.length === 1 ? "key" : "keys"}: {unknown.join(", ")}</p>{/if}
