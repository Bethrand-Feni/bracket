<script setup lang="ts">
import CreateTournamentPage from "./features/create/CreateTournamentPage.vue";
import HomePage from "./features/home/HomePage.vue";
import AppHeader from "./components/ui/AppHeader.vue";
import AppButton from "./components/ui/AppButton.vue";
import AccountTournamentsPage from "./features/account/AccountTournamentsPage.vue";
import NameWheelPage from "./features/wheel/NameWheelPage.vue";
import TournamentStageSwitcher from "./features/tournament/TournamentStageSwitcher.vue";
import QualifierReview from "./features/qualifiers/QualifierReview.vue";
import BracketBoard from "./features/bracket/BracketBoard.vue";
import ResultDialog from "./features/tournament/ResultDialog.vue";
import { useTournamentController } from "./features/tournament/useTournamentController";

const {
  route,
  user,
  goBack,
  navigate,
  importInput,
  logout,
  remoteRevision,
  loadTournament,
  error,
  notice,
  localTournaments,
  loading,
  accountTournaments,
  signIn,
  isWheel,
  wheelText,
  tournament,
  tournamentBasePath,
  wheelEntries,
  wheelHistory,
  wheelRotation,
  wheelSpinning,
  wheelWinner,
  wheelGradient,
  wheelLabelTransform,
  copyParticipantsToWheel,
  shuffleWheel,
  clearWheel,
  spinWheel,
  removeWinner,
  requestFullscreen,
  isManager,
  formatLabels,
  isLocal,
  copyText,
  publicUrl,
  localRecord,
  hostAndShare,
  winner,
  localSaveText,
  legacyHosted,
  organizerUrl,
  claimLegacyTournament,
  exportTournament,
  importTournament,
  duplicateTournament,
  undoResult,
  retryHostedSync,
  stageItems,
  selectedStageId,
  selectStage,
  qualificationStage,
  preliminaryStage,
  knockoutStage,
  qualifierOrder,
  qualifierPlaceholders,
  knockoutPreviewPairs,
  tiesAcknowledged,
  unlockTournamentStage,
  moveQualifier,
  confirmTournamentQualifiers,
  displayedFormat,
  showUpcomingRounds,
  displayedStandings,
  canEditDisplayedMatches,
  groupBoards,
  bracketSections,
  doubleColumns,
  doubleUpperHeight,
  doubleLowerHeight,
  activeRoundIndex,
  hasStandings,
  connectorPaths,
  connectorSizes,
  participantSlotLabel,
  matchCode,
  isGroupLocked,
  bracketCanvasHeight,
  bracketRoot,
  openResultEditor,
  generateSwissRound,
  editingMatch,
  draftFor,
  scoreDrafts,
  closeResultEditor,
  saveScore,
  retentionChoice,
  updateRetention,
  deleteTournament
} = useTournamentController();
</script>

<template>
  <div class="min-h-screen">
    <AppHeader
      :screen="route"
      :signed-in="Boolean(user)"
      @back="goBack"
      @navigate="navigate"
      @import="importInput?.click()"
      @logout="logout"
    />
    <input
      ref="importInput"
      class="sr-only"
      type="file"
      accept=".json,.bracket.json,application/json"
      aria-label="Import a tournament backup"
      @change="importTournament"
    >

    <div v-if="remoteRevision" class="texture-brown flex items-center justify-between gap-4 px-[4vw] py-3 text-sm text-paper">
      <span>Changes have occurred — refresh to see.</span>
      <button class="font-bold underline" @click="loadTournament">Refresh bracket</button>
    </div>
    <div v-if="error" class="flex items-center justify-between border-b border-ink/20 bg-[#ead8d0] px-[4vw] py-3 text-sm" role="alert">
      <span>{{ error }}</span>
      <button class="text-xl" @click="error = ''" aria-label="Dismiss">×</button>
    </div>
    <div v-if="notice" class="flex items-center justify-between border-b border-ink/20 bg-modest px-[4vw] py-3 text-sm" role="status">
      <span>{{ notice }}</span>
      <button class="text-xl" @click="notice = ''" aria-label="Dismiss">×</button>
    </div>

    <HomePage
      v-if="route === 'home'"
      :tournaments="localTournaments"
      @navigate="navigate"
      @import="importInput?.click()"
    />

    <CreateTournamentPage
      v-else-if="route === 'create'"
      @error="error = $event"
    />
    <AccountTournamentsPage
      v-else-if="route === 'account'"
      :user="user"
      :tournaments="accountTournaments"
      :loading="loading"
      @sign-in="signIn()"
      @navigate="navigate"
    />

    <NameWheelPage
      v-else-if="isWheel"
      v-model="wheelText"
      :loading="loading"
      :available="Boolean(tournament)"
      :base-path="tournamentBasePath"
      :entries="wheelEntries"
      :history="wheelHistory"
      :rotation="wheelRotation"
      :spinning="wheelSpinning"
      :winner="wheelWinner"
      :gradient="wheelGradient"
      :label-transform="wheelLabelTransform"
      @navigate="navigate"
      @copy-participants="copyParticipantsToWheel"
      @shuffle="shuffleWheel"
      @clear="clearWheel"
      @spin="spinWheel"
      @remove-winner="removeWinner"
      @fullscreen="requestFullscreen"
    />

    <main v-else class="px-[4vw] py-10">
      <div v-if="loading" class="grid min-h-80 place-items-center text-ink/60">Loading tournament…</div>
      <template v-else-if="tournament">
        <section class="mb-8 flex flex-wrap items-end justify-between gap-8">
          <div>
            <p class="mb-3 text-xs font-extrabold tracking-[.13em] text-blue">{{ isManager ? "ORGANIZER VIEW" : "PUBLIC VIEW" }}</p>
            <h1 class="font-display text-[clamp(3rem,6vw,6.5rem)] font-semibold leading-[.92] tracking-[-.06em]">{{ tournament.name }}</h1>
            <p class="mt-2 text-sm text-ink/70">{{ tournament.participants.length }} players · {{ formatLabels[tournament.format] }} · {{ tournament.status }}</p>
          </div>
          <div class="flex flex-wrap gap-3">
            <AppButton @click="navigate(`${tournamentBasePath}/wheel`)">Open name wheel</AppButton>
            <AppButton v-if="!isLocal" @click="copyText(publicUrl(), 'Public link copied.')">Copy public link</AppButton>
            <AppButton v-else-if="isManager" variant="primary" :disabled="loading" @click="hostAndShare">
              {{
                localRecord?.hostedSlug && localRecord.hostingStatus === "hosted"
                  ? "Open hosted copy"
                  : user
                    ? "Host and share"
                    : "Sign in to host and share"
              }}
            </AppButton>
          </div>
        </section>

        <section v-if="winner" class="texture-blue my-8 grid grid-cols-[auto_1fr_auto] items-center gap-6 px-6 py-5 text-paper">
          <span class="text-xs font-extrabold tracking-[.14em]">CHAMPION</span><strong class="font-display text-3xl">{{ winner }}</strong><span class="text-3xl">┫</span>
        </section>

        <section v-if="isManager" class="my-5 flex flex-wrap items-center justify-between gap-4 border border-ink/20 px-4 py-3 text-sm" :class="isLocal ? 'bg-modest/50' : 'bg-paper'">
          <span v-if="isLocal">Local-only · {{ localSaveText }}.</span>
          <span v-else>Hosted organizer access belongs to your signed-in account.</span>
          <div class="flex flex-wrap gap-4 [&_button]:font-semibold [&_button]:text-blue [&_button]:underline">
            <button v-if="!isLocal" @click="copyText(organizerUrl(), 'Organizer link copied.')">Copy organizer link</button>
            <button v-if="!isLocal && legacyHosted" @click="claimLegacyTournament">
              {{ user ? "Claim to my account" : "Sign in to claim" }}
            </button>
            <button v-if="isLocal" @click="exportTournament">Export JSON</button>
            <button v-if="localRecord" @click="duplicateTournament">Duplicate</button>
            <button @click="undoResult">Undo latest result</button>
          </div>
        </section>

        <section v-if="localRecord?.hostingStatus === 'sync-error' && localRecord.pendingMutation" class="my-5 flex flex-wrap items-center justify-between gap-5 border border-brown bg-[#ead8d0] p-5">
          <div>
            <strong>Hosted sync needs attention</strong>
            <p class="mt-1 text-sm">Your result is safe in this browser. Retry when you are back online.</p>
          </div>
          <AppButton :disabled="loading" @click="retryHostedSync">Retry sync</AppButton>
        </section>

        <TournamentStageSwitcher
          :stages="stageItems"
          :selected-stage-id="selectedStageId"
          :active-stage-id="tournament.activeStageId"
          @select="selectStage"
        />
        <QualifierReview
          v-if="selectedStageId === 'qualifiers'"
          v-model:ties-acknowledged="tiesAcknowledged"
          :tournament="tournament"
          :qualification-stage="qualificationStage"
          :preliminary-stage="preliminaryStage"
          :knockout-stage="knockoutStage"
          :qualifier-order="qualifierOrder"
          :qualifier-placeholders="qualifierPlaceholders"
          :knockout-preview-pairs="knockoutPreviewPairs"
          :is-manager="isManager"
          :loading="loading"
          @unlock="unlockTournamentStage"
          @return-to-preliminary="selectStage('preliminary')"
          @move="moveQualifier"
          @confirm="confirmTournamentQualifiers"
        />
        <section
          v-else-if="selectedStageId === 'knockout' && knockoutStage?.status === 'preview'"
          class="my-6 border border-ink/20"
        >
          <div class="border-b border-ink/20 bg-modest/45 p-6">
            <p class="mb-3 text-xs font-extrabold tracking-[.13em] text-blue">FUTURE STAGE</p>
            <h2 class="font-display text-3xl font-semibold">{{ knockoutStage.format === "double" ? "Double" : "Single" }}-elimination knockout</h2>
            <p class="mt-2 text-sm text-ink/65">Participant names appear after the preliminary stage and qualifier review.</p>
          </div>
          <div class="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <article v-for="(slot, index) in qualifierPlaceholders" :key="`slot-${index}`" class="grid gap-1 border border-dashed border-ink/25 p-4 opacity-60">
              <small class="text-[.65rem] font-bold tracking-[.12em] text-blue">SEED {{ String(index + 1).padStart(2, "0") }}</small>
              <strong>{{ slot.label }}</strong>
            </article>
          </div>
        </section>

        <div
          v-if="selectedStageId !== 'qualifiers' && !(selectedStageId === 'knockout' && knockoutStage?.status === 'preview')"
          class="my-5 flex flex-wrap items-center justify-between gap-4 text-xs text-ink/65"
        >
          <span>
            {{
              displayedFormat === "double"
                ? "One bracket · winners and losers both flow left to right"
                : displayedFormat === "round-robin" || displayedFormat === "swiss" || displayedFormat === "groups"
                  ? "Complete each round to reveal the next"
                  : "Results flow from left to right"
            }}
          </span>
          <label
            v-if="displayedFormat === 'round-robin' || displayedFormat === 'swiss' || displayedFormat === 'groups'"
            class="flex items-center gap-2 font-semibold text-ink"
          >
            <input v-model="showUpcomingRounds" class="size-4 accent-blue" type="checkbox">
            <span>Show upcoming rounds</span>
          </label>
          <span>Scroll sideways to see later rounds →</span>
        </div>
        <BracketBoard
          v-if="selectedStageId !== 'qualifiers' && !(selectedStageId === 'knockout' && knockoutStage?.status === 'preview')"
          :tournament="tournament"
          :displayed-standings="displayedStandings"
          :displayed-format="displayedFormat"
          :can-edit-displayed-matches="canEditDisplayedMatches"
          :group-boards="groupBoards"
          :bracket-sections="bracketSections"
          :double-columns="doubleColumns"
          :double-upper-height="doubleUpperHeight"
          :double-lower-height="doubleLowerHeight"
          :active-round-index="activeRoundIndex"
          :show-upcoming-rounds="showUpcomingRounds"
          :has-standings="hasStandings"
          :connector-paths="connectorPaths"
          :connector-sizes="connectorSizes"
          :participant-slot-label="participantSlotLabel"
          :match-code="matchCode"
          :is-group-locked="isGroupLocked"
          :bracket-canvas-height="bracketCanvasHeight"
          @root-changed="bracketRoot = $event"
          @open="openResultEditor"
          @generate-swiss-round="generateSwissRound"
        />

        <ResultDialog
          v-if="editingMatch"
          :tournament="tournament"
          :match="editingMatch"
          :format="displayedFormat"
          :draft="draftFor(editingMatch)"
          :loading="loading"
          @update-draft="scoreDrafts[editingMatch.id] = $event"
          @close="closeResultEditor"
          @save="saveScore(editingMatch)"
        />

        <footer class="mt-10 flex flex-wrap items-center justify-between gap-5 border-t border-ink/20 py-8 text-sm">
          <span v-if="isLocal">Stored in this browser · no expiry</span>
          <span v-else>Hosted until {{ new Date(tournament.expiresAt).toLocaleDateString() }}</span>
          <div v-if="isManager && !isLocal" class="flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2">
              Keep for
              <select v-model.number="retentionChoice" class="rounded-brand border border-ink/25 bg-paper px-3 py-2">
                <option :value="30">1 month</option>
                <option :value="365">1 year</option>
              </select>
            </label>
            <AppButton @click="updateRetention">Update</AppButton>
            <AppButton variant="danger" @click="deleteTournament">Delete tournament</AppButton>
          </div>
          <div v-else-if="isManager && isLocal" class="flex flex-wrap items-center gap-3">
            <AppButton @click="exportTournament">Export backup</AppButton>
            <AppButton @click="duplicateTournament">Duplicate</AppButton>
            <AppButton variant="danger" @click="deleteTournament">Delete local tournament</AppButton>
          </div>
          <AppButton v-else variant="primary" @click="navigate('/create')">Create your own bracket</AppButton>
        </footer>
      </template>
    </main>
  </div>
</template>
