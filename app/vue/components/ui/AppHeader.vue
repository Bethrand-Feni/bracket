<script setup lang="ts">
import AppButton from "./AppButton.vue";
defineProps<{ screen: string; signedIn: boolean }>();
defineEmits<{
  back: [];
  navigate: [path: string];
  import: [];
  logout: [];
}>();
</script>

<template>
  <header class="grid min-h-20 grid-cols-[auto_1fr_auto] items-center border-b border-ink/25 px-[4vw]">
    <button v-if="screen !== 'home'" class="mr-5 text-3xl" aria-label="Go back" @click="$emit('back')">←</button>
    <button class="col-start-2 justify-self-start border-0 bg-transparent font-display text-2xl font-bold tracking-[-0.04em] text-blue" @click="$emit('navigate', '/')">BRACKET</button>
    <nav class="col-start-3 flex items-center gap-2 sm:gap-4" aria-label="Primary">
      <AppButton v-if="screen === 'home'" variant="ghost" size="sm" @click="$emit('navigate', '/create')">Create</AppButton>
      <AppButton v-if="screen === 'home'" variant="ghost" size="sm" @click="$emit('import')">Import</AppButton>
      <AppButton v-if="signedIn" variant="ghost" size="sm" @click="$emit('navigate', '/account/tournaments')">Saved tournaments</AppButton>
      <AppButton v-if="signedIn" variant="ghost" size="sm" @click="$emit('logout')">Sign out</AppButton>
      <span v-else class="rounded-brand border border-blue px-3 py-2 text-xs font-semibold text-blue">No account needed</span>
    </nav>
  </header>
</template>
