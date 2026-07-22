<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  createTournamentSnapshot,
  formatLabels,
  type GroupAssignmentMethod,
  type KnockoutFormat,
  type SeedingMethod,
  type TournamentFormat,
} from "../../../../lib/tournament";
import { createLocalId } from "../../../local-tournaments";
import { indexedDbTournamentRepository } from "../local-storage/repository";

const emit = defineEmits<{ error: [message: string] }>();
const router = useRouter();
const loading = ref(false);
const setupState = ref<"closed" | "editing">("closed");

const createForm = ref({
  name: "Saturday Game Night",
  format: "single" as TournamentFormat,
  participants: "Ava\nNoah\nMia\nLeo\nZoe\nKai\nIvy\nMax",
  shuffle: false,
  knockoutEnabled: false,
  knockoutFormat: "single" as KnockoutFormat,
  qualifierCount: 4,
  qualifiersPerGroup: 2,
  seeding: "standard" as SeedingMethod,
  swissPreset: "standard" as "short" | "standard" | "thorough",
  groupCount: 2,
  groupAssignment: "seeded" as GroupAssignmentMethod,
  manualGroups: {} as Record<string, string>,
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
});

const formats: Array<{ value: TournamentFormat; label: string; description: string }> = [
  { value: "single", label: "Single elimination", description: "One loss and you're out." },
  { value: "double", label: "Double elimination", description: "A second chance in the lower bracket." },
  { value: "round-robin", label: "Round robin", description: "Everyone meets everyone." },
  { value: "swiss", label: "Swiss", description: "Pair players with similar records. A faster round of robin." },
  { value: "groups", label: "Groups", description: "Split the field, then send the best players to a knockout." },
];

const participantNames = computed(() =>
  createForm.value.participants.split("\n").map((name) => name.trim()).filter(Boolean),
);
const participantCount = computed(() => participantNames.value.length);
const formatLimit = computed(() =>
  createForm.value.format === "round-robin" ? 16 : createForm.value.format === "double" ? 32 : 64,
);
const validGroupCounts = computed(() => {
  const count = participantCount.value;
  return Array.from({ length: Math.max(0, Math.floor(count / 2) - 1) }, (_, index) => index + 2)
    .filter((groups) => count % groups === 0 && count / groups >= 2 && count / groups <= 16);
});
const groupSize = computed(() =>
  createForm.value.groupCount > 0 && participantCount.value % createForm.value.groupCount === 0
    ? participantCount.value / createForm.value.groupCount
    : 0,
);
const swissStandardRounds = computed(() =>
  Math.max(1, Math.ceil(Math.log2(Math.max(2, participantCount.value)))),
);
const swissRounds = computed(() => {
  const offset = createForm.value.swissPreset === "short" ? -1 : createForm.value.swissPreset === "thorough" ? 1 : 0;
  return Math.max(1, Math.min(Math.max(1, participantCount.value - 1), swissStandardRounds.value + offset));
});
const hasKnockoutSetup = computed(() =>
  createForm.value.format === "groups" ||
  ((createForm.value.format === "round-robin" || createForm.value.format === "swiss") && createForm.value.knockoutEnabled),
);
const hasPreliminarySettings = computed(() =>
  ["round-robin", "swiss", "groups"].includes(createForm.value.format),
);
const setupModalTitle = computed(() =>
  createForm.value.format === "groups" ? "Group settings" : createForm.value.format === "swiss" ? "Swiss settings" : "Round robin settings",
);
const preliminarySettingsSummary = computed(() => {
  const knockout = hasKnockoutSetup.value
    ? `Top ${createForm.value.format === "groups" ? createForm.value.groupCount * createForm.value.qualifiersPerGroup : Math.min(participantCount.value, createForm.value.qualifierCount)} → ${createForm.value.knockoutFormat === "double" ? "double" : "single"} elimination`
    : "No knockout stage";
  if (createForm.value.format === "groups") return `${createForm.value.groupCount} groups of ${groupSize.value || "—"} · ${knockout}`;
  if (createForm.value.format === "swiss") return `${swissRounds.value} rounds · ${knockout}`;
  return knockout;
});
const estimatedMatches = computed(() => {
  const count = participantCount.value;
  if (count < 2) return 0;
  if (createForm.value.format === "single") return count - 1;
  if (createForm.value.format === "double") return Math.max(2, count * 2 - 2);
  let preliminary = 0;
  if (createForm.value.format === "round-robin") preliminary = (count * (count - 1)) / 2;
  else if (createForm.value.format === "swiss") preliminary = Math.floor(count / 2) * swissRounds.value;
  else if (createForm.value.format === "groups" && groupSize.value) {
    preliminary = createForm.value.groupCount * ((groupSize.value * (groupSize.value - 1)) / 2);
  }
  if (!hasKnockoutSetup.value) return preliminary;
  const qualifiers = createForm.value.format === "groups"
    ? createForm.value.groupCount * createForm.value.qualifiersPerGroup
    : Math.min(count, createForm.value.qualifierCount);
  return preliminary + (createForm.value.knockoutFormat === "double" ? Math.max(2, qualifiers * 2 - 2) : Math.max(1, qualifiers - 1));
});

function groupLetter(index: number) {
  return String.fromCharCode(64 + index);
}

function setSetupState(state: "closed" | "editing") {
  setupState.value = state;
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === "Escape" && setupState.value === "editing") setSetupState("closed");
}

async function createTournament() {
  emit("error", "");
  const participants = [...participantNames.value];
  if (createForm.value.shuffle && createForm.value.format !== "groups") {
    for (let index = participants.length - 1; index > 0; index -= 1) {
      const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
      const swapIndex = Math.floor(random * (index + 1));
      [participants[index], participants[swapIndex]] = [participants[swapIndex], participants[index]];
    }
  }
  loading.value = true;
  try {
    const tournamentName = createForm.value.name.trim();
    if (tournamentName.length < 2) throw new Error("Add a tournament name.");
    if (participants.length < 2) throw new Error("Add at least two participants.");
    if (participants.length > formatLimit.value) {
      throw new Error(`${formatLabels[createForm.value.format]} supports up to ${formatLimit.value} participants.`);
    }
    if (createForm.value.format === "groups" && !validGroupCounts.value.includes(createForm.value.groupCount)) {
      throw new Error("Choose a group count that divides the participants into equal groups.");
    }
    if (createForm.value.format === "groups" && createForm.value.qualifiersPerGroup > groupSize.value) {
      throw new Error("More players qualify than each group contains.");
    }
    const qualifierTotal = createForm.value.format === "groups"
      ? createForm.value.groupCount * createForm.value.qualifiersPerGroup
      : Math.min(participants.length, createForm.value.qualifierCount);
    if (hasKnockoutSetup.value && createForm.value.knockoutFormat === "double" && qualifierTotal > 32) {
      throw new Error("Double elimination supports up to 32 qualifiers.");
    }
    const now = Date.now();
    const id = createLocalId();
    const randomSeed = crypto.getRandomValues(new Uint32Array(1))[0];
    const manualAssignments = createForm.value.format === "groups" && createForm.value.groupAssignment === "manual"
      ? Object.fromEntries(participants.map((_, index) => [`p-${index + 1}`, createForm.value.manualGroups[`p-${index + 1}`]]))
      : undefined;
    const snapshot = createTournamentSnapshot({
      id,
      slug: id,
      name: tournamentName,
      format: createForm.value.format,
      participantNames: participants,
      expiresAt: 0,
      createdAt: now,
      swissRounds: createForm.value.format === "swiss" ? swissRounds.value : undefined,
      groups: createForm.value.format === "groups" ? {
        groupCount: createForm.value.groupCount,
        assignment: createForm.value.groupAssignment,
        manualAssignments,
        points: { win: createForm.value.winPoints, draw: createForm.value.drawPoints, loss: createForm.value.lossPoints },
      } : undefined,
      knockout: hasKnockoutSetup.value ? {
        format: createForm.value.knockoutFormat,
        seeding: createForm.value.format === "groups"
          ? createForm.value.seeding
          : createForm.value.seeding === "cross-group" ? "standard" : createForm.value.seeding,
        qualifierCount: createForm.value.format === "groups" ? undefined : qualifierTotal,
        qualifiersPerGroup: createForm.value.format === "groups" ? createForm.value.qualifiersPerGroup : undefined,
        randomSeed,
      } : undefined,
    });
    await indexedDbTournamentRepository.put({ localId: id, snapshot, hostingStatus: "local", createdAt: now, updatedAt: now, history: [] });
    await router.push(`/local/${id}/manage`);
  } catch (error) {
    emit("error", error instanceof Error ? error.message : "Could not create the tournament.");
  } finally {
    loading.value = false;
  }
}

watch(setupState, (state) => document.body.classList.toggle("modal-open", state === "editing"));
watch(
  () => [createForm.value.format, participantCount.value] as const,
  ([format]) => {
    if (format === "groups") {
      createForm.value.knockoutEnabled = true;
      createForm.value.seeding = "cross-group";
      if (!validGroupCounts.value.includes(createForm.value.groupCount)) createForm.value.groupCount = validGroupCounts.value[0] ?? 2;
      createForm.value.qualifiersPerGroup = Math.min(2, Math.max(1, groupSize.value));
    } else if (createForm.value.seeding === "cross-group") createForm.value.seeding = "standard";
    createForm.value.qualifierCount = Math.min(Math.max(2, createForm.value.qualifierCount), Math.max(2, participantCount.value));
  },
);

window.addEventListener("keydown", handleEscape);
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleEscape);
  document.body.classList.remove("modal-open");
});
</script>

<template>
  <main class="create-page">
    <section class="create-intro">
      <p class="eyebrow">01 / FORMAT</p>
      <h1>Build a tournament<br>in minutes.</h1>
      <p>Choose a format, add your participants, and we’ll prepare the matches.</p>
      <div class="format-list">
        <button v-for="format in formats" :key="format.value" :class="{ selected: createForm.format === format.value }" :aria-pressed="createForm.format === format.value" @click="createForm.format = format.value">
          <span class="radio-mark"></span>
          <span><b>{{ format.label }}</b><small>{{ format.description }}</small></span>
          <span class="format-glyph">┫</span>
        </button>
      </div>
    </section>
    <section class="create-form-panel">
      <label><span>Tournament name</span><input v-model="createForm.name" maxlength="80" placeholder="e.g. Summer Showdown"></label>
      <label>
        <span class="participant-label">Participants <b :class="{ over: participantCount > formatLimit }">{{ participantCount }} / {{ formatLimit }}</b></span>
        <small>One name per line, ordered by seed · approximately {{ estimatedMatches }} matches</small>
        <textarea v-model="createForm.participants" rows="9"></textarea>
      </label>
      <label v-if="createForm.format !== 'groups'" class="toggle-row">
        <span><b>Shuffle seeds</b><small>Randomize the starting order once.</small></span>
        <input v-model="createForm.shuffle" type="checkbox">
      </label>
      <section v-if="hasPreliminarySettings" class="compact-settings-card">
        <div><span>{{ setupModalTitle }}</span><strong>{{ preliminarySettingsSummary }}</strong></div>
        <button type="button" class="settings-cog" :aria-label="`Open ${setupModalTitle.toLowerCase()}`" @click="setSetupState('editing')"><span aria-hidden="true">⚙</span></button>
      </section>
      <Teleport to="body">
        <div v-if="setupState === 'editing' && hasPreliminarySettings" class="setup-modal-backdrop" @click.self="setSetupState('closed')">
          <section class="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-modal-title">
            <header class="setup-modal-header">
              <div><p class="eyebrow">TOURNAMENT SETTINGS</p><h2 id="setup-modal-title">{{ setupModalTitle }}</h2><p>Choose how this stage runs and how it decides who advances.</p></div>
              <button type="button" class="setup-modal-close" aria-label="Close settings" @click="setSetupState('closed')">×</button>
            </header>
            <div class="setup-modal-content">
              <section v-if="createForm.format === 'swiss'" class="setup-block">
                <div class="setup-heading"><span><b>Swiss rounds</b><small>Choose how thoroughly records are separated.</small></span><strong>{{ swissRounds }} rounds</strong></div>
                <div class="segmented-options three">
                  <button v-for="preset in [{ value: 'short', label: 'Short', rounds: Math.max(1, swissStandardRounds - 1) }, { value: 'standard', label: 'Standard', rounds: swissStandardRounds }, { value: 'thorough', label: 'Thorough', rounds: Math.min(Math.max(1, participantCount - 1), swissStandardRounds + 1) }]" :key="preset.value" type="button" :class="{ selected: createForm.swissPreset === preset.value }" @click="createForm.swissPreset = preset.value as typeof createForm.swissPreset">
                    <b>{{ preset.label }}</b><small>{{ preset.rounds }} rounds</small>
                  </button>
                </div>
              </section>
              <section v-if="createForm.format === 'groups'" class="setup-block">
                <div class="setup-heading"><span><b>Group setup</b><small>Equal groups only for this first version.</small></span><strong v-if="groupSize">{{ createForm.groupCount }} × {{ groupSize }}</strong></div>
                <div v-if="validGroupCounts.length" class="form-grid two">
                  <label><span>Number of groups</span><select v-model.number="createForm.groupCount"><option v-for="count in validGroupCounts" :key="count" :value="count">{{ count }} groups</option></select></label>
                  <label><span>Players per group</span><input :value="groupSize || '—'" readonly></label>
                </div>
                <p v-else class="inline-warning">Add a participant total that can form at least two equal groups.</p>
                <label><span>Assignment method</span><select v-model="createForm.groupAssignment"><option value="seeded">Balance by seed</option><option value="random">Shuffle randomly</option><option value="manual">Assign manually</option></select></label>
                <div v-if="createForm.groupAssignment === 'manual'" class="manual-group-list">
                  <label v-for="(name, index) in participantNames" :key="`manual-${index}-${name}`"><span>{{ name }}</span><select v-model="createForm.manualGroups[`p-${index + 1}`]"><option value="">Choose group</option><option v-for="groupIndex in createForm.groupCount" :key="groupIndex" :value="`group-${groupIndex}`">Group {{ groupLetter(groupIndex) }}</option></select></label>
                </div>
                <div class="points-grid"><label><span>Win</span><input v-model.number="createForm.winPoints" type="number"></label><label><span>Draw</span><input v-model.number="createForm.drawPoints" type="number"></label><label><span>Loss</span><input v-model.number="createForm.lossPoints" type="number"></label></div>
                <p class="setup-summary">{{ participantCount }} players · {{ createForm.groupCount }} groups of {{ groupSize || "—" }} · {{ Math.max(0, groupSize - 1) }} matches per player</p>
              </section>
              <label v-if="createForm.format === 'round-robin' || createForm.format === 'swiss'" class="toggle-row knockout-toggle"><span><b>Add a knockout stage</b><small>Finish with a bracket after standings are confirmed.</small></span><input v-model="createForm.knockoutEnabled" type="checkbox"></label>
              <section v-if="hasKnockoutSetup" class="setup-block knockout-setup">
                <div class="setup-heading"><span><b>Knockout finish</b><small>These settings lock when you create.</small></span></div>
                <div class="form-grid two">
                  <label><span>Format</span><select v-model="createForm.knockoutFormat"><option value="single">Single elimination</option><option value="double">Double elimination</option></select></label>
                  <label v-if="createForm.format === 'groups'"><span>Qualify from each group</span><select v-model.number="createForm.qualifiersPerGroup"><option v-for="count in Math.min(3, Math.max(1, groupSize))" :key="count" :value="count">Top {{ count }}</option></select></label>
                  <label v-else><span>Number of qualifiers</span><select v-model.number="createForm.qualifierCount"><option v-for="count in [2, 4, 8].filter((value) => value <= participantCount)" :key="count" :value="count">Top {{ count }}</option><option v-for="count in Array.from({ length: Math.max(0, participantCount - 1) }, (_, index) => index + 2).filter((value) => ![2, 4, 8].includes(value))" :key="`custom-${count}`" :value="count">Custom · {{ count }}</option></select></label>
                  <label><span>Seeding method</span><select v-model="createForm.seeding"><option value="standard">Standard · highest vs lowest</option><option v-if="createForm.format === 'groups'" value="cross-group">Cross-group · recommended</option><option value="random">Random draw</option><option value="manual">Manual at qualifier review</option></select></label>
                </div>
                <p v-if="Math.log2(createForm.format === 'groups' ? createForm.qualifiersPerGroup * createForm.groupCount : createForm.qualifierCount) % 1 !== 0" class="bye-note">The highest seeds will receive first-round byes.</p>
              </section>
            </div>
            <footer class="setup-modal-footer"><span>{{ preliminarySettingsSummary }}</span><button type="button" class="primary-button" @click="setSetupState('closed')">Save settings</button></footer>
          </section>
        </div>
      </Teleport>
      <button class="primary-button wide" :disabled="loading" @click="createTournament">{{ loading ? "Creating…" : "Create tournament" }} <span>→</span></button>
      <p class="private-note">⌑ Saved automatically in this browser. No account and no upload.</p>
      <p class="browser-warning compact">Clearing this browser’s site data removes local tournaments. You can export a backup after creation.</p>
    </section>
  </main>
</template>
