<script setup lang="ts">
import { participantName, type KnockoutStage, type PreliminaryStage, type QualificationStage, type TournamentSnapshot } from "../../../../lib/tournament";
import AppButton from "../../components/ui/AppButton.vue";
type Slot = { seed: number; label: string; participantId: string };
defineProps<{ tournament: TournamentSnapshot; qualificationStage?: QualificationStage; preliminaryStage?: PreliminaryStage; knockoutStage?: KnockoutStage; qualifierOrder: string[]; qualifierPlaceholders: Slot[]; knockoutPreviewPairs: Slot[][]; isManager: boolean; loading: boolean }>();
const tiesAcknowledged = defineModel<boolean>("tiesAcknowledged", { required: true });
const emit = defineEmits<{ unlock: []; returnToPreliminary: []; move: [index: number, direction: -1 | 1]; confirm: [] }>();
</script>

<template>

        <section class="my-6 border border-ink/20">
          <header class="flex flex-wrap items-start justify-between gap-6 border-b border-ink/20 bg-modest/40 p-6">
            <div>
              <p class="mb-3 text-xs font-extrabold tracking-[.13em] text-blue">CHECKPOINT</p>
              <h2 class="font-display text-3xl font-semibold">Review qualifiers</h2>
              <p class="mt-2 max-w-3xl text-sm text-ink/65">
                {{
                  qualificationStage?.status === "pending"
                    ? "Finish every preliminary match before confirming who advances."
                    : qualificationStage?.status === "confirmed"
                      ? "These players started the knockout stage in this seed order."
                      : "Check the cutoff, resolve any ties, and set the final seed order."
                }}
              </p>
            </div>
            <AppButton
              v-if="isManager && preliminaryStage?.status === 'locked'"
              variant="danger"
              @click="emit('unlock')"
            >
              Unlock preliminary results
            </AppButton>
          </header>

          <div v-if="qualificationStage?.status === 'pending'" class="grid min-h-72 place-items-center gap-3 p-8 text-center">
            <span class="text-xs font-extrabold tracking-[.12em] text-blue">PRELIMINARY STAGE IN PROGRESS</span>
            <strong class="font-display text-2xl">{{ preliminaryStage?.matches.filter((match) => match.status === "complete").length }} / {{ preliminaryStage?.matches.length }} matches complete</strong>
            <AppButton @click="emit('returnToPreliminary')">Return to current stage</AppButton>
          </div>

          <div v-else class="grid lg:grid-cols-[1fr_360px]">
            <div class="p-6">
              <div class="grid grid-cols-[4rem_1fr_6rem] border-b border-ink/20 pb-2 text-xs font-bold uppercase tracking-[.08em] text-blue">
                <span>Seed</span><span>Qualified player</span><span>Adjust</span>
              </div>
              <div
                v-for="(participantId, index) in (
                  qualificationStage?.status === 'confirmed'
                    ? qualificationStage.confirmedParticipantIds
                    : qualifierOrder
                )"
                :key="participantId"
                class="grid grid-cols-[4rem_1fr_6rem] items-center border-b border-ink/15 py-3"
                :class="{
                  'bg-[#ead8d0]/55': qualificationStage?.cutoffTieParticipantIds.includes(participantId),
                }"
              >
                <strong>{{ String(index + 1).padStart(2, "0") }}</strong>
                <span class="grid gap-1">
                  <b>{{ participantName(tournament, participantId) }}</b>
                  <small
                    v-if="qualificationStage?.cutoffTieParticipantIds.includes(participantId)"
                  class="text-[.6rem] font-bold uppercase tracking-[.08em] text-brown">Tied at cutoff</small>
                </span>
                <span v-if="isManager && qualificationStage?.status === 'review'" class="flex gap-2">
                  <button class="size-8 border border-ink/20" :disabled="index === 0" aria-label="Move seed up" @click="emit('move', index, -1)">↑</button>
                  <button class="size-8 border border-ink/20" :disabled="index === qualifierOrder.length - 1" aria-label="Move seed down" @click="emit('move', index, 1)">↓</button>
                </span>
                <span v-else>—</span>
              </div>

              <label
                v-if="qualificationStage?.status === 'review' && qualificationStage.cutoffTieParticipantIds.length"
                class="mt-5 flex items-center gap-3 border border-brown/30 bg-[#ead8d0]/55 p-4 text-sm"
              >
                <input v-model="tiesAcknowledged" class="size-5 accent-blue" type="checkbox">
                <span>I have reviewed the cutoff tie and accept this order.</span>
              </label>
              <AppButton
                v-if="isManager && qualificationStage?.status === 'review'"
                variant="primary"
                full
                :disabled="loading || !qualifierOrder.length || (qualificationStage.cutoffTieParticipantIds.length > 0 && !tiesAcknowledged)"
                @click="emit('confirm')"
              >
                Confirm and start knockout <span>→</span>
              </AppButton>
            </div>

            <aside class="border-t border-ink/20 bg-modest/35 p-6 lg:border-l lg:border-t-0">
              <p class="mb-3 text-xs font-extrabold tracking-[.13em] text-blue">FIRST ROUND PREVIEW</p>
              <h3 class="mb-5 font-display text-2xl font-semibold">{{ knockoutStage?.format === "double" ? "Double" : "Single" }} elimination</h3>
              <div
                v-for="(pair, index) in knockoutPreviewPairs"
                :key="`preview-${index}`"
                class="mb-3 grid divide-y divide-ink/15 border border-ink/20 bg-paper [&_span]:px-3 [&_span]:py-2"
              >
                <span>{{ pair[0]?.label ?? "BYE" }}</span>
                <span>{{ pair[1]?.label ?? "BYE" }}</span>
              </div>
              <p v-if="Math.log2(qualifierPlaceholders.length) % 1 !== 0" class="mt-4 border-l-2 border-brown pl-3 text-xs text-brown">
                Highest seeds receive first-round byes.
              </p>
            </aside>
          </div>
        </section>

</template>
