<script setup lang="ts">
import { nextTick, onBeforeUnmount, watch } from "vue";
const props = defineProps<{ open: boolean; title: string; description?: string }>();
const emit = defineEmits<{ close: [] }>();
let previousFocus: HTMLElement | null = null;
function keydown(event: KeyboardEvent) { if (event.key === "Escape") emit("close"); }
watch(() => props.open, async (open) => {
  if (open) {
    previousFocus = document.activeElement as HTMLElement | null;
    document.body.classList.add("modal-open");
    window.addEventListener("keydown", keydown);
    await nextTick();
    document.querySelector<HTMLElement>('[role="dialog"] button, [role="dialog"] input, [role="dialog"] select')?.focus();
  } else {
    document.body.classList.remove("modal-open");
    window.removeEventListener("keydown", keydown);
    previousFocus?.focus();
  }
}, { immediate: true });
onBeforeUnmount(() => window.removeEventListener("keydown", keydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4" @click.self="emit('close')">
      <section role="dialog" aria-modal="true" :aria-label="title" class="texture-paper max-h-[90vh] w-full max-w-xl overflow-auto rounded-brand border border-ink/25 p-6 shadow-brand">
        <header class="mb-6 flex items-start justify-between gap-4">
          <div><h2 class="font-display text-2xl font-semibold">{{ title }}</h2><p v-if="description" class="mt-2 text-sm text-ink/70">{{ description }}</p></div>
          <button class="text-xl" aria-label="Close" @click="emit('close')">×</button>
        </header>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
