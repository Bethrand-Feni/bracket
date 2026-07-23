<script setup lang="ts">
import { formatLabels, type TournamentFormat } from "../../../../lib/tournament";
import AppButton from "../../components/ui/AppButton.vue";
import AppCard from "../../components/ui/AppCard.vue";

defineProps<{
  user: { id: string; email: string; name: string | null; avatar_url: string | null } | null;
  tournaments: Array<Record<string, string | number>>;
  loading: boolean;
}>();
defineEmits<{ signIn: []; navigate: [path: string] }>();
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-[4vw] py-16">
    <div class="mb-10">
      <p class="mb-4 text-xs font-extrabold tracking-[0.13em] text-blue">YOUR ACCOUNT</p>
      <h1 class="font-display text-5xl font-semibold tracking-[-0.05em] sm:text-7xl">Hosted tournaments</h1>
      <p class="mt-4 text-ink/70">Only tournaments you explicitly host and share appear here.</p>
    </div>
    <AppButton v-if="!user" variant="primary" @click="$emit('signIn')">Continue with Google</AppButton>
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AppCard v-for="item in tournaments" :key="String(item.slug)" interactive>
        <small>{{ formatLabels[item.format as TournamentFormat] }}</small>
        <h2 class="my-3 font-display text-2xl font-semibold">{{ item.name }}</h2>
        <p class="mb-5 text-sm text-ink/65">Hosted until {{ new Date(Number(item.expires_at)).toLocaleDateString() }}</p>
        <AppButton size="sm" @click="$emit('navigate', `/t/${item.slug}/manage`)">Open tournament →</AppButton>
      </AppCard>
      <p v-if="!tournaments.length && !loading" class="border border-dashed border-ink/25 p-8 text-ink/65">No saved tournaments yet.</p>
    </div>
  </main>
</template>
