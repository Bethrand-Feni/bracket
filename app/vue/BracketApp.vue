<script setup lang="ts">
import CreateTournamentPage from "./features/create/CreateTournamentPage.vue";
import HomePage from "./features/home/HomePage.vue";
import AppHeader from "./components/ui/AppHeader.vue";
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
  <div class="app-shell">
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
      class="visually-hidden"
      type="file"
      accept=".json,.bracket.json,application/json"
      aria-label="Import a tournament backup"
      @change="importTournament"
    >

    <div v-if="remoteRevision" class="refresh-banner">
      <span>Changes have occurred — refresh to see.</span>
      <button @click="loadTournament">Refresh bracket</button>
    </div>
    <div v-if="error" class="message error-message" role="alert">
      <span>{{ error }}</span>
      <button @click="error = ''" aria-label="Dismiss">×</button>
    </div>
    <div v-if="notice" class="message notice-message" role="status">
      <span>{{ notice }}</span>
      <button @click="notice = ''" aria-label="Dismiss">×</button>
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

    <main v-else class="tournament-page">
      <div v-if="loading" class="loading-state">Loading tournament…</div>
      <template v-else-if="tournament">
        <section class="tournament-heading">
          <div>
            <p class="eyebrow">{{ isManager ? "ORGANIZER VIEW" : "PUBLIC VIEW" }}</p>
            <h1>{{ tournament.name }}</h1>
            <p>{{ tournament.participants.length }} players · {{ formatLabels[tournament.format] }} · {{ tournament.status }}</p>
          </div>
          <div class="tournament-actions">
            <button class="outline-button" @click="navigate(`${tournamentBasePath}/wheel`)">Open name wheel</button>
            <button v-if="!isLocal" class="outline-button" @click="copyText(publicUrl(), 'Public link copied.')">Copy public link</button>
            <button v-else-if="isManager" class="primary-button" :disabled="loading" @click="hostAndShare">
              {{
                localRecord?.hostedSlug && localRecord.hostingStatus === "hosted"
                  ? "Open hosted copy"
                  : user
                    ? "Host and share"
                    : "Sign in to host and share"
              }}
            </button>
          </div>
        </section>

        <section v-if="winner" class="champion-strip">
          <span>CHAMPION</span><strong>{{ winner }}</strong><span class="champion-mark">┫</span>
        </section>

        <section v-if="isManager" class="organizer-note" :class="{ 'local-note': isLocal }">
          <span v-if="isLocal">Local-only · {{ localSaveText }}.</span>
          <span v-else>Hosted organizer access belongs to your signed-in account.</span>
          <div>
            <button v-if="!isLocal" @click="copyText(organizerUrl(), 'Organizer link copied.')">Copy organizer link</button>
            <button v-if="!isLocal && legacyHosted" @click="claimLegacyTournament">
              {{ user ? "Claim to my account" : "Sign in to claim" }}
            </button>
            <button v-if="isLocal" @click="exportTournament">Export JSON</button>
            <button v-if="localRecord" @click="duplicateTournament">Duplicate</button>
            <button @click="undoResult">Undo latest result</button>
          </div>
        </section>

        <section v-if="localRecord?.hostingStatus === 'sync-error' && localRecord.pendingMutation" class="sync-error-panel">
          <div>
            <strong>Hosted sync needs attention</strong>
            <p>Your result is safe in this browser. Retry when you are back online.</p>
          </div>
          <button class="outline-button" :disabled="loading" @click="retryHostedSync">Retry sync</button>
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
          class="knockout-preview-board"
        >
          <div class="future-stage-note">
            <p class="eyebrow">FUTURE STAGE</p>
            <h2>{{ knockoutStage.format === "double" ? "Double" : "Single" }}-elimination knockout</h2>
            <p>Participant names appear after the preliminary stage and qualifier review.</p>
          </div>
          <div class="placeholder-bracket">
            <article v-for="(slot, index) in qualifierPlaceholders" :key="`slot-${index}`">
              <small>SEED {{ String(index + 1).padStart(2, "0") }}</small>
              <strong>{{ slot.label }}</strong>
            </article>
          </div>
        </section>

        <div
          v-if="selectedStageId !== 'qualifiers' && !(selectedStageId === 'knockout' && knockoutStage?.status === 'preview')"
          class="bracket-guidance"
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
            class="round-visibility-toggle"
          >
            <input v-model="showUpcomingRounds" type="checkbox">
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

        <footer class="tournament-footer">
          <span v-if="isLocal">Stored in this browser · no expiry</span>
          <span v-else>Hosted until {{ new Date(tournament.expiresAt).toLocaleDateString() }}</span>
          <div v-if="isManager && !isLocal" class="retention-controls">
            <label>
              Keep for
              <select v-model.number="retentionChoice">
                <option :value="30">1 month</option>
                <option :value="365">1 year</option>
              </select>
            </label>
            <button class="outline-button" @click="updateRetention">Update</button>
            <button class="danger-link" @click="deleteTournament">Delete tournament</button>
          </div>
          <div v-else-if="isManager && isLocal" class="retention-controls">
            <button class="outline-button" @click="exportTournament">Export backup</button>
            <button class="outline-button" @click="duplicateTournament">Duplicate</button>
            <button class="danger-link" @click="deleteTournament">Delete local tournament</button>
          </div>
          <button v-else class="primary-button" @click="navigate('/create')">Create your own bracket</button>
        </footer>
      </template>
    </main>
  </div>
</template>
