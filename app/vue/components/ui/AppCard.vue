<script setup lang="ts">
withDefaults(defineProps<{ surface?: "paper" | "blue" | "brown"; interactive?: boolean }>(), {
  surface: "paper",
  interactive: false,
});
</script>

<template>
  <section
    class="rounded-brand border border-ink/20 p-5"
    :class="[
      surface === 'paper' && 'texture-paper text-ink',
      surface === 'blue' && 'texture-blue border-blue text-paper',
      surface === 'brown' && 'texture-brown border-brown text-paper',
      interactive && 'transition-transform hover:-translate-y-0.5 hover:shadow-brand',
    ]"
  >
    <slot />
  </section>
</template>
