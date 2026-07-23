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
    class="match-card relative border border-ink/20 bg-paper text-sm"
    :class="[
      `is-${match.status}`,
      pod ? `pod-${pod}` : '',
      match.status === 'waiting' ? 'border-dashed opacity-45' : '',
      pod === 'losers' ? 'border-brown/40' : '',
      pod === 'championship' ? 'border-blue outline outline-1 outline-blue' : '',
      { editable: editable && match.status !== 'waiting', 'unified-double-card': unified },
    ]"
    :data-match-id="match.id"
  >
    <span v-if="code" class="absolute -top-5 left-0 text-[.58rem] font-bold uppercase tracking-[.08em] text-blue"><b>{{ code }}</b> · {{ context }}</span>
    <button class="flex w-full items-center justify-between border-b border-ink/15 px-3 py-2.5 text-left hover:bg-modest/40 disabled:opacity-100" :disabled="!editable || locked || match.status === 'waiting'" :class="Boolean(match.winnerId) && match.winnerId === match.participantAId ? 'texture-blue text-paper' : ''" @click="emit('open', match.participantAId)">
      <span>{{ labelA }}</span><b>{{ match.scoreA ?? "—" }}</b>
    </button>
    <button class="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-modest/40 disabled:opacity-100" :disabled="!editable || locked || match.status === 'waiting'" :class="Boolean(match.winnerId) && match.winnerId === match.participantBId ? 'texture-blue text-paper' : ''" @click="emit('open', match.participantBId)">
      <span>{{ labelB }}</span><b>{{ match.scoreB ?? "—" }}</b>
    </button>
    <small v-if="match.status === 'complete'" class="flex items-center justify-between border-t border-ink/15 px-3 py-2 text-[.58rem] uppercase tracking-[.06em]">
      <span class="flex items-center gap-2"><i class="size-1.5 rounded-full bg-blue"></i>complete</span>
      <button v-if="editable" class="font-bold text-blue" @click="emit('open')">Edit result</button>
    </small>
  </article>
</template>
