<script setup lang="ts">
defineProps<{ screen: string; signedIn: boolean }>();
defineEmits<{
  back: [];
  navigate: [path: string];
  import: [];
  logout: [];
}>();
</script>

<template>
  <header class="site-header">
    <button v-if="screen !== 'home'" class="back-link" aria-label="Go back" @click="$emit('back')">←</button>
    <button class="wordmark" @click="$emit('navigate', '/')">BRACKET</button>
    <nav class="header-nav" aria-label="Primary">
      <button v-if="screen === 'home'" @click="$emit('navigate', '/create')">Create</button>
      <button v-if="screen === 'home'" @click="$emit('import')">Import</button>
      <button v-if="signedIn" @click="$emit('navigate', '/account/tournaments')">Saved tournaments</button>
      <button v-if="signedIn" class="text-button" @click="$emit('logout')">Sign out</button>
      <span v-else class="no-account-pill">No account needed</span>
    </nav>
  </header>
</template>
