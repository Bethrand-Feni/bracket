<script setup lang="ts">
import { participantName, type Match, type TournamentFormat, type TournamentSnapshot } from "../../../../lib/tournament";

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
  <div class="result-dialog-backdrop" @click.self="$emit('close')">
    <section class="result-dialog" role="dialog" aria-modal="true" aria-labelledby="result-dialog-title">
      <button class="dialog-close" aria-label="Close result editor" @click="$emit('close')">×</button>
      <p class="eyebrow">MATCH RESULT</p>
      <h2 id="result-dialog-title">{{ participantName(tournament, match.participantAId) }} <span>vs</span> {{ participantName(tournament, match.participantBId) }}</h2>
      <div class="dialog-score">
        <label><span>{{ participantName(tournament, match.participantAId) }}</span><input :value="draft.a" type="number" min="0" max="999" @input="updateScore('a', $event)"></label>
        <b>:</b>
        <label><span>{{ participantName(tournament, match.participantBId) }}</span><input :value="draft.b" type="number" min="0" max="999" @input="updateScore('b', $event)"></label>
      </div>
      <p v-if="format === 'single' || format === 'double'" class="dialog-help">Elimination matches require a clear winner.</p>
      <div class="dialog-actions">
        <button class="outline-button" @click="$emit('close')">Cancel</button>
        <button class="primary-button" :disabled="loading" @click="$emit('save')">{{ match.status === "complete" ? "Update result" : "Save result" }} <span>→</span></button>
      </div>
    </section>
  </div>
</template>
