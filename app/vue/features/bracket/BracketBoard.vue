<script setup lang="ts">
import { ref, watch } from "vue";
import { participantName, type Match, type Standing, type TournamentFormat, type TournamentSnapshot } from "../../../../lib/tournament";
import MatchCard from "./MatchCard.vue";
type MatchGroup = { label: string; matches: Match[] };
type GroupBoard = { id: string; label: string; participantIds: string[]; rounds: MatchGroup[]; standings: Standing[] };
type BracketSection = { id: string; title: string; note: string; groups: MatchGroup[] };
type DoubleColumn = { column: number; label: string; winners: Match[]; final: Match[]; losers: Match[] };
type Connector = { id: string; d: string; loser: boolean; roundFlow?: boolean };
defineProps<{ tournament: TournamentSnapshot; displayedStandings: Standing[]; displayedFormat: TournamentFormat; canEditDisplayedMatches: boolean; groupBoards: GroupBoard[]; bracketSections: BracketSection[]; doubleColumns: DoubleColumn[]; doubleUpperHeight: number; doubleLowerHeight: number; activeRoundIndex: number; showUpcomingRounds: boolean; hasStandings: boolean; connectorPaths: Record<string, Connector[]>; connectorSizes: Record<string, { width: number; height: number }>; participantSlotLabel: (match: Match, slot: "a" | "b") => string; matchCode: (match: Match) => string; isGroupLocked: (sectionId: string, groupIndex: number) => boolean; bracketCanvasHeight: (groups: MatchGroup[], sectionId?: string) => number }>();
const emit = defineEmits<{ open: [match: Match, preferredWinnerId: string | null]; generateSwissRound: []; rootChanged: [root: HTMLElement | null] }>();
const root = ref<HTMLElement | null>(null);
watch(root, (value) => emit("rootChanged", value), { immediate: true });
</script>

<template>

        <section
          v-if="selectedStageId !== 'qualifiers' && !(selectedStageId === 'knockout' && knockoutStage?.status === 'preview')"
          ref="root"
          class="bracket-layout"
          :class="{ 'no-standings': !hasStandings, 'double-layout': displayedFormat === 'double', 'groups-layout': displayedFormat === 'groups' }"
        >
          <div class="bracket-board">
            <div v-if="groupBoards.length" class="groups-board">
              <section v-for="group in groupBoards" :key="group.id" class="group-board">
                <header>
                  <div><p>QUALIFICATION POOL</p><h2>{{ group.label }}</h2></div>
                  <span>{{ group.participantIds.length }} players</span>
                </header>
                <div class="group-rounds">
                  <div
                    v-for="(round, roundIndex) in group.rounds"
                    :key="`${group.id}-${round.label}`"
                    class="group-round"
                    :class="{ 'round-locked': !showUpcomingRounds && roundIndex > activeRoundIndex }"
                  >
                    <h3>{{ round.label }}</h3>
                    <MatchCard
                      v-for="match in round.matches"
                      :key="match.id"
                      :match="match"
                      :label-a="participantSlotLabel(match, 'a')"
                      :label-b="participantSlotLabel(match, 'b')"
                      :editable="canEditDisplayedMatches"
                      :locked="!showUpcomingRounds && roundIndex > activeRoundIndex"
                      @open="emit('open', match, $event)"
                    />
                  </div>
                </div>
                <div class="group-table">
                  <div class="standing-head"><span>#</span><span>Player</span><span>Pts</span></div>
                  <div v-for="(standing, index) in group.standings" :key="standing.participantId" class="standing-row">
                    <span>{{ String(index + 1).padStart(2, "0") }}</span>
                    <b>{{ participantName(tournament, standing.participantId) }}</b>
                    <span>{{ standing.points }}</span>
                  </div>
                </div>
              </section>
            </div>
            <div
              v-else-if="displayedFormat === 'double'"
              class="bracket-canvas unified-double-canvas"
              data-section="double"
              :style="{
                height: `${doubleUpperHeight + doubleLowerHeight + 230}px`,
                '--double-upper-height': `${doubleUpperHeight}px`,
                '--double-lower-height': `${doubleLowerHeight}px`,
              }"
            >
              <svg
                v-if="connectorPaths.double?.length"
                class="bracket-connectors"
                :width="connectorSizes.double?.width"
                :height="connectorSizes.double?.height"
                :viewBox="`0 0 ${connectorSizes.double?.width ?? 0} ${connectorSizes.double?.height ?? 0}`"
                aria-hidden="true"
              >
                <path
                  v-for="connector in connectorPaths.double"
                  :key="connector.id"
                  :d="connector.d"
                />
              </svg>
              <div
                v-for="column in doubleColumns"
                :key="column.column"
                class="bracket-column unified-double-column"
              >
                <h2>{{ column.label }}</h2>
                <div
                  v-for="tier in [
                    { id: 'winners', matches: column.winners },
                    { id: 'championship', matches: column.final },
                    { id: 'losers', matches: column.losers },
                  ]"
                  :key="tier.id"
                  class="match-stack double-tier"
                  :class="`double-tier-${tier.id}`"
                >
                  <MatchCard
                    v-for="match in tier.matches"
                    :key="match.id"
                    :match="match"
                    :label-a="participantSlotLabel(match, 'a')"
                    :label-b="participantSlotLabel(match, 'b')"
                    :editable="canEditDisplayedMatches"
                    :code="matchCode(match)"
                    :context="tier.id === 'championship' ? 'CHAMPIONSHIP' : tier.id.toUpperCase()"
                    :pod="tier.id"
                    unified
                    @open="emit('open', match, $event)"
                  />
                </div>
              </div>
            </div>
            <template v-else>
              <section
                v-for="section in bracketSections"
                :key="section.id"
                class="bracket-section"
                :class="`section-${section.id}`"
              >
              <header v-if="section.title" class="bracket-section-heading">
                <div>
                  <p>{{ section.id === "losers" ? "SECOND CHANCE" : section.id === "winners" ? "UNBEATEN PATH" : "TITLE MATCH" }}</p>
                  <h2>{{ section.title }}</h2>
                </div>
                <span>{{ section.note }}</span>
              </header>
              <div
                class="bracket-canvas"
                :data-section="section.id"
                :style="{ height: `${bracketCanvasHeight(section.groups, section.id)}px` }"
              >
                <svg
                  v-if="connectorPaths[section.id]?.length"
                  class="bracket-connectors"
                  :width="connectorSizes[section.id]?.width"
                  :height="connectorSizes[section.id]?.height"
                  :viewBox="`0 0 ${connectorSizes[section.id]?.width ?? 0} ${connectorSizes[section.id]?.height ?? 0}`"
                  aria-hidden="true"
                >
                  <path
                    v-for="connector in connectorPaths[section.id]"
                    :key="connector.id"
                    :d="connector.d"
                    :class="{ loser: connector.loser, 'round-flow': connector.roundFlow }"
                  />
                </svg>
                <div
                  v-for="(group, groupIndex) in section.groups"
                  :key="group.label"
                  class="bracket-column"
                  :class="{ 'round-locked': isGroupLocked(section.id, groupIndex) }"
                >
                  <h2>{{ group.label }}</h2>
                  <div class="match-stack">
                    <MatchCard
                      v-for="match in group.matches"
                      :key="match.id"
                      :match="match"
                      :label-a="participantSlotLabel(match, 'a')"
                      :label-b="participantSlotLabel(match, 'b')"
                      :editable="canEditDisplayedMatches"
                      :locked="isGroupLocked(section.id, groupIndex)"
                      @open="emit('open', match, $event)"
                    />
                  </div>
                </div>
              </div>
              </section>
            </template>
          </div>
          <aside v-if="displayedStandings.length && displayedFormat !== 'groups'" class="standings-panel">
            <h2>Standings</h2>
            <div class="standing-head"><span>#</span><span>Player</span><span>Pts</span></div>
            <div v-for="(standing, index) in displayedStandings" :key="standing.participantId" class="standing-row">
              <span>{{ String(index + 1).padStart(2, "0") }}</span>
              <b>{{ participantName(tournament, standing.participantId) }}</b>
              <span>{{ standing.points }}</span>
            </div>
            <button
              v-if="canEditDisplayedMatches && displayedFormat === 'swiss'"
              class="outline-button wide swiss-button"
              @click="emit('generateSwissRound')"
            >Generate next round</button>
          </aside>
        </section>
</template>

