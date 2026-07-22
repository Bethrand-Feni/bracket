<script setup lang="ts">
import { participantName, type KnockoutStage, type PreliminaryStage, type QualificationStage, type TournamentSnapshot } from "../../../../lib/tournament";
type Slot = { seed: number; label: string; participantId: string };
defineProps<{ tournament: TournamentSnapshot; qualificationStage?: QualificationStage; preliminaryStage?: PreliminaryStage; knockoutStage?: KnockoutStage; qualifierOrder: string[]; qualifierPlaceholders: Slot[]; knockoutPreviewPairs: Slot[][]; isManager: boolean; loading: boolean }>();
const tiesAcknowledged = defineModel<boolean>("tiesAcknowledged", { required: true });
const emit = defineEmits<{ unlock: []; returnToPreliminary: []; move: [index: number, direction: -1 | 1]; confirm: [] }>();
</script>

<template>

        <section
          v-if="selectedStageId === 'qualifiers'"
          class="qualification-workspace"
          :class="`qualification-${qualificationStage?.status ?? 'pending'}`"
        >
          <header class="qualification-heading">
            <div>
              <p class="eyebrow">CHECKPOINT</p>
              <h2>Review qualifiers</h2>
              <p>
                {{
                  qualificationStage?.status === "pending"
                    ? "Finish every preliminary match before confirming who advances."
                    : qualificationStage?.status === "confirmed"
                      ? "These players started the knockout stage in this seed order."
                      : "Check the cutoff, resolve any ties, and set the final seed order."
                }}
              </p>
            </div>
            <button
              v-if="isManager && preliminaryStage?.status === 'locked'"
              class="danger-outline"
              @click="emit('unlock')"
            >
              Unlock preliminary results
            </button>
          </header>

          <div v-if="qualificationStage?.status === 'pending'" class="qualification-pending">
            <span>PRELIMINARY STAGE IN PROGRESS</span>
            <strong>{{ preliminaryStage?.matches.filter((match) => match.status === "complete").length }} / {{ preliminaryStage?.matches.length }} matches complete</strong>
            <button class="outline-button" @click="emit('returnToPreliminary')">Return to current stage</button>
          </div>

          <div v-else class="qualification-grid">
            <div class="qualifier-list-panel">
              <div class="qualifier-list-heading">
                <span>Seed</span><span>Qualified player</span><span>Adjust</span>
              </div>
              <div
                v-for="(participantId, index) in (
                  qualificationStage?.status === 'confirmed'
                    ? qualificationStage.confirmedParticipantIds
                    : qualifierOrder
                )"
                :key="participantId"
                class="qualifier-row"
                :class="{
                  'cutoff-tie': qualificationStage?.cutoffTieParticipantIds.includes(participantId),
                }"
              >
                <strong>{{ String(index + 1).padStart(2, "0") }}</strong>
                <span>
                  <b>{{ participantName(tournament, participantId) }}</b>
                  <small
                    v-if="qualificationStage?.cutoffTieParticipantIds.includes(participantId)"
                  >Tied at cutoff</small>
                </span>
                <span v-if="isManager && qualificationStage?.status === 'review'" class="seed-controls">
                  <button :disabled="index === 0" aria-label="Move seed up" @click="emit('move', index, -1)">↑</button>
                  <button :disabled="index === qualifierOrder.length - 1" aria-label="Move seed down" @click="emit('move', index, 1)">↓</button>
                </span>
                <span v-else>—</span>
              </div>

              <label
                v-if="qualificationStage?.status === 'review' && qualificationStage.cutoffTieParticipantIds.length"
                class="tie-confirmation"
              >
                <input v-model="tiesAcknowledged" type="checkbox">
                <span>I have reviewed the cutoff tie and accept this order.</span>
              </label>
              <button
                v-if="isManager && qualificationStage?.status === 'review'"
                class="primary-button wide"
                :disabled="loading || !qualifierOrder.length || (qualificationStage.cutoffTieParticipantIds.length > 0 && !tiesAcknowledged)"
                @click="emit('confirm')"
              >
                Confirm and start knockout <span>→</span>
              </button>
            </div>

            <aside class="qualification-preview">
              <p class="eyebrow">FIRST ROUND PREVIEW</p>
              <h3>{{ knockoutStage?.format === "double" ? "Double" : "Single" }} elimination</h3>
              <div
                v-for="(pair, index) in knockoutPreviewPairs"
                :key="`preview-${index}`"
                class="preview-match"
              >
                <span>{{ pair[0]?.label ?? "BYE" }}</span>
                <span>{{ pair[1]?.label ?? "BYE" }}</span>
              </div>
              <p v-if="Math.log2(qualifierPlaceholders.length) % 1 !== 0" class="bye-note">
                Highest seeds receive first-round byes.
              </p>
            </aside>
          </div>
        </section>

</template>

