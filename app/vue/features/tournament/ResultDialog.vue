<script setup lang="ts">
import { participantName, type Match, type TournamentFormat, type TournamentSnapshot } from "../../../../lib/tournament";
import AppButton from "../../components/ui/AppButton.vue";
import AppModal from "../../components/ui/AppModal.vue";

const props = defineProps<{
  tournament: TournamentSnapshot;
  match: Match;
  format: TournamentFormat;
  draft: { a: number; b: number };
  loading: boolean;
}>();
const emit = defineEmits<{
  close: [];
  save: [];
  updateDraft: [draft: { a: number; b: number }];
}>();

function updateScore(key: "a" | "b", event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  emit("updateDraft", { ...props.draft, [key]: value });
}
</script>

<template>
  <AppModal :open="true" title="Match result" @close="$emit('close')">
      <h2 class="mb-6 font-display text-2xl font-semibold">{{ participantName(tournament, match.participantAId) }} <span class="text-ink/50">vs</span> {{ participantName(tournament, match.participantBId) }}</h2>
      <div class="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
        <label class="grid gap-2 text-sm font-semibold"><span>{{ participantName(tournament, match.participantAId) }}</span><input class="w-full rounded-brand border border-ink/25 bg-paper px-3 py-3 text-center text-2xl" :value="draft.a" type="number" min="0" max="999" @input="updateScore('a', $event)"></label>
        <b class="pb-3 text-xl">:</b>
        <label class="grid gap-2 text-sm font-semibold"><span>{{ participantName(tournament, match.participantBId) }}</span><input class="w-full rounded-brand border border-ink/25 bg-paper px-3 py-3 text-center text-2xl" :value="draft.b" type="number" min="0" max="999" @input="updateScore('b', $event)"></label>
      </div>
      <p v-if="format === 'single' || format === 'double'" class="mt-4 text-sm text-ink/65">Elimination matches require a clear winner.</p>
      <div class="mt-6 flex justify-end gap-3">
        <AppButton @click="$emit('close')">Cancel</AppButton>
        <AppButton variant="primary" :loading="loading" @click="$emit('save')">{{ match.status === "complete" ? "Update result" : "Save result" }} <span>→</span></AppButton>
      </div>
  </AppModal>
</template>
