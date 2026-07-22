<script setup lang="ts">
import type { Match } from "../../../../lib/tournament";

withDefaults(defineProps<{
  match: Match;
  labelA: string;
  labelB: string;
  editable: boolean;
  locked?: boolean;
  code?: string;
  context?: string;
  pod?: string;
  unified?: boolean;
}>(), { locked: false, code: "", context: "", pod: "", unified: false });

const emit = defineEmits<{ open: [preferredWinnerId?: string | null] }>();
</script>

<template>
  <article
    class="match-card"
    :class="[
      `is-${match.status}`,
      pod ? `pod-${pod}` : '',
      { editable: editable && match.status !== 'waiting', 'unified-double-card': unified },
    ]"
    :data-match-id="match.id"
  >
    <span v-if="code" class="match-code"><b>{{ code }}</b> · {{ context }}</span>
    <button :disabled="!editable || locked || match.status === 'waiting'" :class="{ winner: Boolean(match.winnerId) && match.winnerId === match.participantAId }" @click="emit('open', match.participantAId)">
      <span>{{ labelA }}</span><b>{{ match.scoreA ?? "—" }}</b>
    </button>
    <button :disabled="!editable || locked || match.status === 'waiting'" :class="{ winner: Boolean(match.winnerId) && match.winnerId === match.participantBId }" @click="emit('open', match.participantBId)">
      <span>{{ labelB }}</span><b>{{ match.scoreB ?? "—" }}</b>
    </button>
    <small v-if="match.status === 'complete'">
      <span><i class="complete"></i>complete</span>
      <button v-if="editable" @click="emit('open')">Edit result</button>
    </small>
  </article>
</template>
