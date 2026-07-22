<script setup lang="ts">
import { formatLabels, type TournamentFormat } from "../../../../lib/tournament";

defineProps<{
  user: { id: string; email: string; name: string | null; avatar_url: string | null } | null;
  tournaments: Array<Record<string, string | number>>;
  loading: boolean;
}>();
defineEmits<{ signIn: []; navigate: [path: string] }>();
</script>

<template>
  <main class="account-page">
    <div class="page-heading">
      <p class="eyebrow">YOUR ACCOUNT</p>
      <h1>Hosted tournaments</h1>
      <p>Only tournaments you explicitly host and share appear here.</p>
    </div>
    <button v-if="!user" class="primary-button" @click="$emit('signIn')">Continue with Google</button>
    <div v-else class="saved-grid">
      <article v-for="item in tournaments" :key="String(item.slug)" class="saved-card">
        <small>{{ formatLabels[item.format as TournamentFormat] }}</small>
        <h2>{{ item.name }}</h2>
        <p>Hosted until {{ new Date(Number(item.expires_at)).toLocaleDateString() }}</p>
        <button @click="$emit('navigate', `/t/${item.slug}/manage`)">Open tournament →</button>
      </article>
      <p v-if="!tournaments.length && !loading" class="empty-state">No saved tournaments yet.</p>
    </div>
  </main>
</template>
