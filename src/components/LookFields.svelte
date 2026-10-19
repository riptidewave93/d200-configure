<!-- How a key looks: icon or image, label, font and colours. -->
<script lang="ts">
  import { MaxIconBytes, type Look } from "../lib/config";
  import { emojiID, emojiPNG, type Emoji } from "../lib/emoji";
  import { app } from "../lib/context";
  import { set } from "../lib/edit";
  import ColorField from "./ColorField.svelte";
  import IconField from "./IconField.svelte";

  let { look }: { look: Look } = $props();

  const { doc, deck } = app();
  let images = $derived(Object.keys(doc.config?.images ?? {}).sort());
  let customFonts = $derived(Object.keys(doc.config?.fonts ?? {}).sort());
  let builtinFonts = $derived(deck()?.names.fonts ?? []);

  // Changing one of icon and image clears the other: a key shows one.
  function setIcon(v: string) {
    set(look, "icon", v);
    if (v) delete look.image;
  }
  // An emoji goes in the config's icons as a small PNG, once, however many
  // keys use it; saving drops it again when no key does.
  let emojiError = $state("");
  async function setEmoji(e: Emoji) {
    emojiError = "";
    const id = emojiID(e.hex);
    const icons = (doc.config!.icons ??= {});
    if (!icons[id]?.png) {
      try {
        let png = await emojiPNG(e.char);
        if (atob(png).length > MaxIconBytes) png = await emojiPNG(e.char, 96);
        icons[id] = { png };
      } catch {
        emojiError = "This browser couldn't draw that emoji.";
        return;
      }
    }
    setIcon(id);
  }

  function setImage(v: string) {
    set(look, "image", v);
    if (v) delete look.icon;
  }

  // the device keeps up to 32 characters on up to 3 lines
  let labelError = $derived.by(() => {
    const l = look.label ?? "";
    if ([...l].length > 32) return "Up to 32 characters.";
    if (l.split("\n").length > 3) return "Up to 3 lines.";
    return "";
  });
</script>

<IconField value={look.icon} onchange={setIcon} onemoji={setEmoji} />
{#if emojiError}<p class="bad small">{emojiError}</p>{/if}
{#if images.length}
  <label>
    <span>Or image</span>
    <select value={look.image ?? ""} onchange={(e) => setImage(e.currentTarget.value)}>
      <option value="">None</option>
      {#each images as id (id)}<option value={id}>{id}</option>{/each}
    </select>
  </label>
{/if}

<label>
  <span>Label</span>
  <textarea rows="2" bind:value={() => look.label ?? "", (v) => set(look, "label", v)}></textarea>
</label>
{#if labelError}<p class="bad">{labelError}</p>{/if}

<div class="row">
  <label class="grow">
    <span>Font</span>
    <select bind:value={() => look.font ?? "", (v) => set(look, "font", v)}>
      <option value="">Default</option>
      {#each builtinFonts as f (f)}<option value={f}>{f}</option>{/each}
      {#each customFonts as f (f)}<option value={f}>{f}</option>{/each}
    </select>
  </label>
</div>

<div class="row colors">
  <ColorField label="Text and icon" value={look.color} fallback="#e8e8e8" onchange={(v) => set(look, "color", v)} />
  <ColorField
    label="Background"
    value={look.background}
    fallback="#1c1c1c"
    onchange={(v) => set(look, "background", v)}
  />
</div>

<style>
  .colors {
    gap: 16px;
    margin-bottom: 12px;
  }
</style>
