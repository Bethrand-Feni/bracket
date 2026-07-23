<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
import AppButton from "../../components/ui/AppButton.vue";
import AppModal from "../../components/ui/AppModal.vue";

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

</script>

<template>
  <main class="grid min-h-[calc(100vh-80px)] lg:grid-cols-[minmax(360px,.85fr)_minmax(480px,1.15fr)]">
    <section class="border-b border-ink/20 px-[5vw] py-12 lg:border-b-0 lg:border-r lg:py-[6vw]">
      <p class="mb-4 text-xs font-extrabold tracking-[.13em] text-blue">01 / FORMAT</p>
      <h1 class="font-display text-[clamp(3rem,6vw,6.5rem)] font-semibold leading-[.92] tracking-[-.06em]">Build a tournament<br>in minutes.</h1>
      <p class="mt-6 max-w-xl text-base leading-7 text-ink/70">Choose a format, add your participants, and we’ll prepare the matches.</p>
      <div class="mt-10 grid border-t border-ink/20">
        <button v-for="format in formats" :key="format.value" class="grid grid-cols-[18px_1fr_auto] items-center gap-4 border-b border-ink/20 px-1 py-4 text-left transition-colors hover:text-blue" :class="createForm.format === format.value ? 'text-blue' : 'text-ink'" :aria-pressed="createForm.format === format.value" @click="createForm.format = format.value">
          <span class="size-4 rounded-full border border-current p-[3px]"><span v-if="createForm.format === format.value" class="block size-full rounded-full bg-blue"></span></span>
          <span class="grid gap-1"><b>{{ format.label }}</b><small class="text-xs leading-5 text-ink/65">{{ format.description }}</small></span>
          <span class="font-display text-xl">┫</span>
        </button>
      </div>
    </section>
    <section class="grid content-center gap-6 px-[5vw] py-12 lg:py-[6vw]">
      <label class="grid gap-2 text-sm font-semibold"><span>Tournament name</span><input v-model="createForm.name" class="rounded-brand border border-ink/25 bg-paper px-4 py-3 outline-none focus:border-blue focus:ring-2 focus:ring-blue/20" maxlength="80" placeholder="e.g. Summer Showdown"></label>
      <label class="grid gap-2 text-sm font-semibold">
        <span class="flex justify-between">Participants <b :class="participantCount > formatLimit ? 'text-brown' : 'text-blue'">{{ participantCount }} / {{ formatLimit }}</b></span>
        <small class="font-normal text-ink/60">One name per line, ordered by seed · approximately {{ estimatedMatches }} matches</small>
        <textarea v-model="createForm.participants" class="min-h-56 rounded-brand border border-ink/25 bg-paper px-4 py-3 outline-none focus:border-blue focus:ring-2 focus:ring-blue/20" rows="9"></textarea>
      </label>
      <label v-if="createForm.format !== 'groups'" class="flex items-center justify-between gap-6 border-y border-ink/15 py-4">
        <span class="grid gap-1"><b>Shuffle seeds</b><small class="text-xs text-ink/60">Randomize the starting order once.</small></span>
        <input v-model="createForm.shuffle" class="size-5 accent-blue" type="checkbox">
      </label>
      <section v-if="hasPreliminarySettings" class="flex items-center justify-between gap-5 rounded-brand border border-ink/20 bg-modest/45 p-4">
        <div class="grid gap-1"><span class="text-xs font-extrabold uppercase tracking-[.12em] text-blue">{{ setupModalTitle }}</span><strong class="text-sm">{{ preliminarySettingsSummary }}</strong></div>
        <AppButton type="button" variant="outline" icon-only :aria-label="`Open ${setupModalTitle.toLowerCase()}`" @click="setSetupState('editing')"><span aria-hidden="true">⚙</span></AppButton>
      </section>
      <AppModal :open="setupState === 'editing' && hasPreliminarySettings" :title="setupModalTitle" description="Choose how this stage runs and how it decides who advances." @close="setSetupState('closed')">
            <div class="grid gap-5">
              <section v-if="createForm.format === 'swiss'" class="grid gap-4 border-t border-ink/15 pt-5">
                <div class="flex items-start justify-between gap-4"><span class="grid"><b>Swiss rounds</b><small class="text-xs text-ink/60">Choose how thoroughly records are separated.</small></span><strong class="text-blue">{{ swissRounds }} rounds</strong></div>
                <div class="grid grid-cols-3 gap-2">
                  <button v-for="preset in [{ value: 'short', label: 'Short', rounds: Math.max(1, swissStandardRounds - 1) }, { value: 'standard', label: 'Standard', rounds: swissStandardRounds }, { value: 'thorough', label: 'Thorough', rounds: Math.min(Math.max(1, participantCount - 1), swissStandardRounds + 1) }]" :key="preset.value" type="button" class="grid gap-1 rounded-brand border px-3 py-3 text-left" :class="createForm.swissPreset === preset.value ? 'border-blue bg-blue text-paper' : 'border-ink/20'" @click="createForm.swissPreset = preset.value as typeof createForm.swissPreset">
                    <b>{{ preset.label }}</b><small class="text-xs opacity-70">{{ preset.rounds }} rounds</small>
                  </button>
                </div>
              </section>
              <section v-if="createForm.format === 'groups'" class="grid gap-4 border-t border-ink/15 pt-5">
                <div class="flex items-start justify-between gap-4"><span class="grid"><b>Group setup</b><small class="text-xs text-ink/60">Equal groups only for this first version.</small></span><strong v-if="groupSize" class="text-blue">{{ createForm.groupCount }} × {{ groupSize }}</strong></div>
                <div v-if="validGroupCounts.length" class="grid gap-4 sm:grid-cols-2">
                  <label class="grid gap-2 text-sm font-semibold"><span>Number of groups</span><select v-model.number="createForm.groupCount" class="rounded-brand border border-ink/25 bg-paper px-3 py-2.5"><option v-for="count in validGroupCounts" :key="count" :value="count">{{ count }} groups</option></select></label>
                  <label class="grid gap-2 text-sm font-semibold"><span>Players per group</span><input :value="groupSize || '—'" class="rounded-brand border border-ink/25 bg-modest/40 px-3 py-2.5" readonly></label>
                </div>
                <p v-else class="border-l-2 border-brown pl-3 text-xs text-brown">Add a participant total that can form at least two equal groups.</p>
                <label class="grid gap-2 text-sm font-semibold"><span>Assignment method</span><select v-model="createForm.groupAssignment" class="rounded-brand border border-ink/25 bg-paper px-3 py-2.5"><option value="seeded">Balance by seed</option><option value="random">Shuffle randomly</option><option value="manual">Assign manually</option></select></label>
                <div v-if="createForm.groupAssignment === 'manual'" class="max-h-64 divide-y divide-ink/15 overflow-auto border border-ink/15">
                  <label v-for="(name, index) in participantNames" :key="`manual-${index}-${name}`" class="grid grid-cols-[1fr_10rem] items-center gap-3 p-3 text-sm"><span>{{ name }}</span><select v-model="createForm.manualGroups[`p-${index + 1}`]" class="rounded-brand border border-ink/25 bg-paper px-2 py-1.5"><option value="">Choose group</option><option v-for="groupIndex in createForm.groupCount" :key="groupIndex" :value="`group-${groupIndex}`">Group {{ groupLetter(groupIndex) }}</option></select></label>
                </div>
                <div class="grid grid-cols-3 gap-3 [&_label]:grid [&_label]:gap-1 [&_label]:text-xs [&_label]:font-semibold [&_input]:min-w-0 [&_input]:rounded-brand [&_input]:border [&_input]:border-ink/25 [&_input]:bg-paper [&_input]:px-3 [&_input]:py-2"><label><span>Win</span><input v-model.number="createForm.winPoints" type="number"></label><label><span>Draw</span><input v-model.number="createForm.drawPoints" type="number"></label><label><span>Loss</span><input v-model.number="createForm.lossPoints" type="number"></label></div>
                <p class="bg-modest/45 p-3 text-xs text-ink/70">{{ participantCount }} players · {{ createForm.groupCount }} groups of {{ groupSize || "—" }} · {{ Math.max(0, groupSize - 1) }} matches per player</p>
              </section>
              <label v-if="createForm.format === 'round-robin' || createForm.format === 'swiss'" class="flex items-center justify-between gap-6 border-y border-ink/15 py-4"><span class="grid"><b>Add a knockout stage</b><small class="text-xs text-ink/60">Finish with a bracket after standings are confirmed.</small></span><input v-model="createForm.knockoutEnabled" class="size-5 accent-blue" type="checkbox"></label>
              <section v-if="hasKnockoutSetup" class="grid gap-4 border-t border-ink/15 pt-5">
                <div class="grid"><b>Knockout finish</b><small class="text-xs text-ink/60">These settings lock when you create.</small></div>
                <div class="grid gap-4 sm:grid-cols-2 [&_label]:grid [&_label]:gap-2 [&_label]:text-sm [&_label]:font-semibold [&_select]:rounded-brand [&_select]:border [&_select]:border-ink/25 [&_select]:bg-paper [&_select]:px-3 [&_select]:py-2.5">
                  <label><span>Format</span><select v-model="createForm.knockoutFormat"><option value="single">Single elimination</option><option value="double">Double elimination</option></select></label>
                  <label v-if="createForm.format === 'groups'"><span>Qualify from each group</span><select v-model.number="createForm.qualifiersPerGroup"><option v-for="count in Math.min(3, Math.max(1, groupSize))" :key="count" :value="count">Top {{ count }}</option></select></label>
                  <label v-else><span>Number of qualifiers</span><select v-model.number="createForm.qualifierCount"><option v-for="count in [2, 4, 8].filter((value) => value <= participantCount)" :key="count" :value="count">Top {{ count }}</option><option v-for="count in Array.from({ length: Math.max(0, participantCount - 1) }, (_, index) => index + 2).filter((value) => ![2, 4, 8].includes(value))" :key="`custom-${count}`" :value="count">Custom · {{ count }}</option></select></label>
                  <label><span>Seeding method</span><select v-model="createForm.seeding"><option value="standard">Standard · highest vs lowest</option><option v-if="createForm.format === 'groups'" value="cross-group">Cross-group · recommended</option><option value="random">Random draw</option><option value="manual">Manual at qualifier review</option></select></label>
                </div>
                <p v-if="Math.log2(createForm.format === 'groups' ? createForm.qualifiersPerGroup * createForm.groupCount : createForm.qualifierCount) % 1 !== 0" class="border-l-2 border-brown pl-3 text-xs text-brown">The highest seeds will receive first-round byes.</p>
              </section>
            </div>
            <footer class="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-ink/15 pt-5"><span class="text-xs text-ink/65">{{ preliminarySettingsSummary }}</span><AppButton type="button" variant="primary" @click="setSetupState('closed')">Save settings</AppButton></footer>
      </AppModal>
      <AppButton variant="primary" full :loading="loading" @click="createTournament">Create tournament <span>→</span></AppButton>
      <p class="text-center text-xs text-ink/60">⌑ Saved automatically in this browser. No account and no upload.</p>
      <p class="mx-auto max-w-xl border-l-2 border-brown pl-3 text-xs leading-5 text-brown">Clearing this browser’s site data removes local tournaments. You can export a backup after creation.</p>
    </section>
  </main>
</template>
