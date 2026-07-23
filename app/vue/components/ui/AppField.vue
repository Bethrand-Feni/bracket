<script setup lang="ts">
import { useId } from "vue";
const props = defineProps<{ id?: string; label: string; hint?: string; error?: string }>();
const fieldId = props.id ?? useId();
</script>

<template>
  <label :for="fieldId" class="grid gap-2 text-sm font-semibold text-ink">
    <span>{{ label }}</span>
    <slot :id="fieldId" />
    <small v-if="error" class="font-normal text-brown">{{ error }}</small>
    <small v-else-if="hint" class="font-normal text-ink/65">{{ hint }}</small>
  </label>
</template>
