<script setup lang="ts">
withDefaults(defineProps<{
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  full?: boolean;
  iconOnly?: boolean;
}>(), { variant: "outline", size: "md", loading: false, full: false, iconOnly: false });
</script>

<template>
  <button
    :disabled="loading || $attrs.disabled === true"
    class="inline-flex items-center justify-center rounded-brand border font-display font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-55"
    :class="[
      size === 'sm' ? 'min-h-8 px-3 py-1.5 text-xs' : 'min-h-11 px-4 py-2.5 text-sm',
      full && 'w-full',
      iconOnly && (size === 'sm' ? 'size-8 !p-0' : 'size-11 !p-0'),
      variant === 'primary' && 'texture-blue border-blue text-paper hover:border-blue-dark hover:bg-blue-dark',
      variant === 'outline' && 'border-blue bg-transparent text-blue hover:bg-blue hover:text-paper',
      variant === 'ghost' && 'border-transparent bg-transparent text-ink hover:bg-modest',
      variant === 'danger' && 'border-brown bg-transparent text-brown hover:bg-brown hover:text-paper',
    ]"
  >
    <span v-if="loading" class="mr-2 size-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
    <slot />
  </button>
</template>
