<!-- A colour, or the default when unset. -->
<script lang="ts">
  let {
    label,
    value,
    fallback,
    onchange,
  }: { label: string; value?: string; fallback: string; onchange: (v: string) => void } = $props();
</script>

<div class="color">
  <label class="row">
    <input type="color" value={value || fallback} oninput={(e) => onchange(e.currentTarget.value)} />
    <span>{label}{#if !value}<span class="muted">{" "}(default)</span>{/if}</span>
  </label>
  {#if value}<button type="button" class="plain" onclick={() => onchange("")}>Reset</button>{/if}
</div>

<style>
  .color {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .color label {
    margin: 0;
    flex-wrap: nowrap;
  }
  .color label > span {
    display: inline;
    margin: 0;
    color: var(--fg);
    font-size: inherit;
  }
  input[type="color"] {
    width: 36px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: none;
  }
</style>
