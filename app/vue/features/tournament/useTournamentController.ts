import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  applyResult,
  confirmQualifiers,
  formatLabels,
  generateNextSwissRound,
  normalizeTournamentSnapshot,
  participantName,
  stageMatches,
  stageStandings,
  unlockPreliminaryStage,
  upgradeDoubleEliminationSnapshot,
  type Match,
  type TournamentStageId,
  type TournamentFormat,
  type TournamentSnapshot,
} from "../../../../lib/tournament";
import {
  duplicateLocalTournament,
  makeTournamentExport,
  parseTournamentExport,
  type LocalTournamentRecord,
  type PendingHostedMutation,
} from "../../../local-tournaments";
import { useNameWheel } from "../wheel/useNameWheel";
import { useBracketView } from "../bracket/useBracketView";
import { useBracketConnectors } from "../bracket/useBracketConnectors";
import { useResultEditor } from "./useResultEditor";
import { indexedDbTournamentRepository } from "../local-storage/repository";
import { hostedTournamentClient } from "../hosting/client";

type User = { id: string; email: string; name: string | null; avatar_url: string | null };


export function useTournamentController() {
const vueRoute = useRoute();
const router = useRouter();
const path = computed(() => vueRoute.path);
const loading = ref(false);
const error = ref("");
const notice = ref("");
const tournament = ref<TournamentSnapshot | null>(null);
const localRecord = ref<LocalTournamentRecord | null>(null);
const localTournaments = ref<LocalTournamentRecord[]>([]);
const remoteRevision = ref<number | null>(null);
const legacyHosted = ref(false);
const user = ref<User | null>(null);
const accountTournaments = ref<Array<Record<string, string | number>>>([]);
const retentionChoice = ref(365);
const importInput = ref<HTMLInputElement | null>(null);
const localSaveText = ref("Saved locally");
const showUpcomingRounds = ref(false);
const selectedStageId = ref<TournamentStageId>("preliminary");
const qualifierOrder = ref<string[]>([]);
const tiesAcknowledged = ref(false);

const route = computed(() => {
  if (path.value === "/create") return "create";
  if (path.value === "/account/tournaments") return "account";
  if (/^\/local\/[^/]+\/wheel$/.test(path.value)) return "local-wheel";
  if (/^\/local\/[^/]+\/manage$/.test(path.value)) return "local-manage";
  if (/^\/local\/[^/]+$/.test(path.value)) return "local-public";
  if (/^\/t\/[^/]+\/wheel$/.test(path.value)) return "wheel";
  if (/^\/t\/[^/]+\/manage$/.test(path.value)) return "manage";
  if (/^\/t\/[^/]+$/.test(path.value)) return "public";
  return "home";
});

const slug = computed(() => path.value.match(/^\/t\/([^/]+)/)?.[1] ?? "");
const localId = computed(() => path.value.match(/^\/local\/([^/]+)/)?.[1] ?? "");
const isLocal = computed(() => route.value.startsWith("local-"));
const organizerToken = computed(() => {
  if (!slug.value) return "";
  const fragment = new URLSearchParams(window.location.hash.slice(1)).get("key");
  if (fragment) {
    localStorage.setItem(`bracket-organizer-${slug.value}`, fragment);
    return fragment;
  }
  return localStorage.getItem(`bracket-organizer-${slug.value}`) ?? "";
});
const isManager = computed(() => route.value === "manage" || route.value === "local-manage");
const isWheel = computed(() => route.value === "wheel" || route.value === "local-wheel");
const tournamentBasePath = computed(() =>
  isLocal.value ? `/local/${localId.value}` : `/t/${slug.value}`,
);
const wheelStorageKey = computed(() => isLocal.value ? localId.value : slug.value);
const wheel = useNameWheel(tournament, wheelStorageKey, (message) => {
  notice.value = message;
});
const {
  entries: wheelEntries,
  text: wheelText,
  history: wheelHistory,
  rotation: wheelRotation,
  spinning: wheelSpinning,
  winner: wheelWinner,
  gradient: wheelGradient,
  load: loadWheelState,
  copyParticipants: copyParticipantsToWheel,
  shuffle: shuffleWheel,
  clear: clearWheel,
  spin: spinWheel,
  removeWinner,
  labelTransform: wheelLabelTransform,
} = wheel;
const stageItems = computed(() => {
  if (!tournament.value?.stages) return [];
  const items: Array<{
    id: TournamentStageId;
    label: string;
    status: string;
  }> = [];
  const preliminary = tournament.value.stages.preliminary;
  if (preliminary) {
    items.push({
      id: "preliminary",
      label:
        preliminary.format === "groups"
          ? "Group stage"
          : preliminary.format === "round-robin"
            ? "Round robin"
            : "Swiss",
      status: preliminary.status,
    });
  }
  const qualification = tournament.value.stages.qualification;
  if (qualification) {
    items.push({
      id: "qualifiers",
      label: "Qualifiers",
      status: qualification.status,
    });
  }
  const knockout = tournament.value.stages.knockout;
  if (knockout) {
    items.push({
      id: "knockout",
      label: "Knockout",
      status: knockout.status,
    });
  }
  return items;
});
const displayedMatches = computed(() =>
  tournament.value
    ? stageMatches(tournament.value, selectedStageId.value)
    : [],
);
const displayedStandings = computed(() =>
  tournament.value
    ? stageStandings(tournament.value, selectedStageId.value)
    : [],
);
const displayedFormat = computed<TournamentFormat>(() => {
  if (!tournament.value) return "single";
  if (selectedStageId.value === "knockout") {
    return tournament.value.stages?.knockout?.format ?? tournament.value.format;
  }
  return tournament.value.stages?.preliminary?.format ?? tournament.value.format;
});
const canEditDisplayedMatches = computed(
  () =>
    isManager.value &&
    selectedStageId.value === tournament.value?.activeStageId &&
    selectedStageId.value !== "qualifiers",
);
const resultEditor = useResultEditor(displayedMatches, canEditDisplayedMatches, recordResult);
const {
  drafts: scoreDrafts,
  editingMatch,
  draftFor,
  open: openResultEditor,
  close: closeResultEditor,
  handleKeydown: handleWindowKeydown,
  save: saveScore,
} = resultEditor;
const qualificationStage = computed(
  () => tournament.value?.stages?.qualification,
);
const preliminaryStage = computed(
  () => tournament.value?.stages?.preliminary,
);
const knockoutStage = computed(() => tournament.value?.stages?.knockout);
const qualifierPlaceholders = computed(() => {
  const tournamentValue = tournament.value;
  const qualification = qualificationStage.value;
  const preliminary = preliminaryStage.value;
  if (!tournamentValue || !qualification || !preliminary) return [];
  if (qualification.proposedParticipantIds.length) {
    return qualification.proposedParticipantIds.map((participantId, index) => ({
      seed: index + 1,
      label: participantName(tournamentValue, participantId),
      participantId,
    }));
  }
  if (preliminary.format === "groups") {
    const perGroup = qualification.qualifiersPerGroup ?? 1;
    return (preliminary.groups ?? []).flatMap((group) =>
      Array.from({ length: perGroup }, (_, index) => ({
        seed: 0,
        label: `${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : "rd"} ${group.label}`,
        participantId: "",
      })),
    ).map((slot, index) => ({ ...slot, seed: index + 1 }));
  }
  return Array.from({ length: qualification.qualifierCount }, (_, index) => ({
    seed: index + 1,
    label:
      preliminary.format === "swiss"
        ? `Swiss seed ${index + 1}`
        : `${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"} overall`,
    participantId: "",
  }));
});
const knockoutPreviewPairs = computed(() => {
  const slots = qualifierPlaceholders.value;
  if (slots.length < 2) return [];
  const size = 2 ** Math.ceil(Math.log2(slots.length));
  let positions = [1, 2];
  while (positions.length < size) {
    const nextSize = positions.length * 2 + 1;
    positions = positions.flatMap((seed) => [seed, nextSize - seed]);
  }
  const bracketSlots = positions.map((seed) =>
    seed <= slots.length
      ? slots[seed - 1]
      : { seed, label: "BYE", participantId: "" },
  );
  return Array.from({ length: size / 2 }, (_, index) => [
    bracketSlots[index * 2],
    bracketSlots[index * 2 + 1],
  ]);
});
const bracketView = useBracketView({
  tournament,
  displayedMatches,
  displayedStandings,
  displayedFormat,
  preliminaryStage,
  selectedStageId,
  showUpcomingRounds,
});
const {
  groupBoards,
  bracketSections,
  doubleColumns,
  doubleUpperHeight,
  doubleLowerHeight,
  activeRoundIndex,
  isGroupLocked,
  bracketCanvasHeight,
  hasStandings,
  winner,
  matchCode,
  participantSlotLabel,
} = bracketView;
const bracketConnectors = useBracketConnectors({ tournament, displayedMatches, displayedFormat });
const {
  root: bracketRoot,
  paths: connectorPaths,
  sizes: connectorSizes,
  update: updateConnectors,
} = bracketConnectors;
let versionTimer: number | undefined;
let unsubscribeLocalChanges = () => {};

function plainSnapshot(value: TournamentSnapshot) {
  return JSON.parse(JSON.stringify(value)) as TournamentSnapshot;
}

function navigate(nextPath: string) {
  error.value = "";
  notice.value = "";
  void router.push(nextPath);
}

function goBack() {
  router.back();
}

async function api<T>(url: string, options: RequestInit = {}) {
  return hostedTournamentClient.request<T>(url, options, organizerToken.value);
}

async function loadSession() {
  try {
    const data = await api<{ user: User | null }>("/api/auth/session");
    user.value = data.user;
  } catch {
    user.value = null;
  }
}

async function loadTournament() {
  if (!slug.value) return;
  loading.value = true;
  try {
    const data = await api<{
      tournament: TournamentSnapshot;
      revision: number;
      legacyAnonymous?: boolean;
    }>(
      `/api/tournaments/${slug.value}`,
    );
    tournament.value = normalizeTournamentSnapshot(data.tournament);
    selectedStageId.value =
      tournament.value.activeStageId ?? "preliminary";
    legacyHosted.value = Boolean(data.legacyAnonymous);
    remoteRevision.value = null;
    localRecord.value = await indexedDbTournamentRepository.findByHostedSlug(slug.value) ?? null;
    if (
      localRecord.value &&
      !localRecord.value.pendingMutation &&
      data.tournament.revision >= (localRecord.value.hostedRevision ?? 0)
    ) {
      localRecord.value = await indexedDbTournamentRepository.put({
        ...localRecord.value,
        snapshot: tournament.value,
        hostingStatus: "hosted",
        hostedRevision: data.tournament.revision,
      });
    }
    if (route.value === "wheel") loadWheelState();
  } catch (err) {
    const fallback = await indexedDbTournamentRepository.findByHostedSlug(slug.value);
    if (fallback) {
      localRecord.value = fallback;
      tournament.value = fallback.snapshot;
      notice.value = "Offline view: showing the latest copy saved in this browser.";
    } else {
      error.value = err instanceof Error ? err.message : "Tournament unavailable.";
      tournament.value = null;
    }
  } finally {
    loading.value = false;
  }
}

async function loadLocalTournament() {
  if (!localId.value) return;
  loading.value = true;
  try {
    const record = await indexedDbTournamentRepository.get(localId.value);
    if (!record) throw new Error("This local tournament is not stored in this browser.");
    const upgraded = upgradeDoubleEliminationSnapshot(
      normalizeTournamentSnapshot(record.snapshot),
    );
    localRecord.value =
      upgraded === record.snapshot
        ? record
        : await indexedDbTournamentRepository.put({
            ...record,
            snapshot: upgraded,
            history: [...(record.history ?? []), record.snapshot].slice(-50),
          });
    tournament.value = localRecord.value.snapshot;
    selectedStageId.value =
      tournament.value.activeStageId ?? "preliminary";
    if (upgraded !== record.snapshot) {
      notice.value =
        record.snapshot.format === "double"
          ? "Double-elimination bracket upgraded. Existing compatible results were kept."
          : "Tournament upgraded to the staged format. Existing results were kept.";
    }
    remoteRevision.value = null;
    if (route.value === "local-wheel") loadWheelState();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Local tournament unavailable.";
    localRecord.value = null;
    tournament.value = null;
  } finally {
    loading.value = false;
  }
}

async function checkVersion() {
  if (!tournament.value || document.hidden) return;
  try {
    const data = await api<{ revision: number }>(
      `/api/tournaments/${tournament.value.slug}/version`,
    );
    if (data.revision > tournament.value.revision) remoteRevision.value = data.revision;
  } catch {
    // The full refresh surface will explain expired/deleted tournaments.
  }
}

async function loadAccount() {
  loading.value = true;
  try {
    const data = await api<{ tournaments: Array<Record<string, string | number>> }>(
      "/api/account/tournaments",
    );
    accountTournaments.value = data.tournaments;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Sign in to see saved tournaments.";
  } finally {
    loading.value = false;
  }
}

async function loadRoute() {
  window.clearInterval(versionTimer);
  if (isLocal.value) {
    await loadLocalTournament();
  } else if (["public", "manage", "wheel"].includes(route.value)) {
    await loadTournament();
    versionTimer = window.setInterval(checkVersion, 15_000);
  } else if (route.value === "account") {
    await loadAccount();
  } else {
    localTournaments.value = await indexedDbTournamentRepository.list();
  }
}

async function saveLocalSnapshot(
  snapshot: TournamentSnapshot,
  options: { history?: TournamentSnapshot[]; status?: LocalTournamentRecord["hostingStatus"]; pendingMutation?: PendingHostedMutation } = {},
) {
  if (!localRecord.value) return;
  localRecord.value = await indexedDbTournamentRepository.put({
    ...localRecord.value,
    snapshot,
    history: options.history ?? localRecord.value.history,
    hostingStatus: options.status ?? localRecord.value.hostingStatus,
    pendingMutation: options.pendingMutation,
  });
  tournament.value = snapshot;
  localSaveText.value = "Saved locally · just now";
}

async function recordResult(
  match: Match,
  winnerId: string | null,
  draw = false,
  scores?: { a: number; b: number },
) {
  if (!tournament.value) return false;
  error.value = "";
  const aWins = winnerId === match.participantAId;
  const input = {
    matchId: match.id,
    scoreA: scores?.a ?? (draw ? 1 : aWins ? 1 : 0),
    scoreB: scores?.b ?? (draw ? 1 : aWins ? 0 : 1),
    winnerId,
  };
  if (isLocal.value) {
    try {
      const before = plainSnapshot(tournament.value);
      const snapshot = applyResult(plainSnapshot(tournament.value), input);
      await saveLocalSnapshot(snapshot, {
        history: [...(localRecord.value?.history ?? []), before].slice(-50),
      });
      if (snapshot.activeStageId !== before.activeStageId) {
        selectedStageId.value = snapshot.activeStageId ?? selectedStageId.value;
      }
      notice.value = "Result saved in this browser.";
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Could not save the result.";
      return false;
    }
  }
  loading.value = true;
  try {
    const data = await api<{ tournament: TournamentSnapshot }>(
      `/api/tournaments/${tournament.value.slug}/matches`,
      {
        method: "PATCH",
        body: JSON.stringify({ ...input, expectedRevision: tournament.value.revision }),
      },
    );
    tournament.value = data.tournament;
    if (data.tournament.activeStageId) {
      selectedStageId.value = data.tournament.activeStageId;
    }
    if (localRecord.value) {
      await saveLocalSnapshot(data.tournament, {
        status: "hosted",
        pendingMutation: undefined,
      });
      localRecord.value.hostedRevision = data.tournament.revision;
      localRecord.value = await indexedDbTournamentRepository.put(localRecord.value);
    }
    notice.value = "Result saved.";
    return true;
  } catch (err) {
    const typed = err as Error & { status?: number };
    if (typed.status === 409) {
      remoteRevision.value = tournament.value.revision + 1;
      error.value = "A newer hosted version exists. Refresh before recording another result.";
    } else if (localRecord.value) {
      const before = plainSnapshot(tournament.value);
      const snapshot = applyResult(plainSnapshot(tournament.value), input);
      await saveLocalSnapshot(snapshot, {
        history: [...(localRecord.value.history ?? []), before].slice(-50),
        status: "sync-error",
        pendingMutation: { kind: "result", ...input, expectedRevision: before.revision },
      });
      error.value = "Saved locally, but the hosted copy could not sync. You can retry safely.";
    } else {
      error.value = typed.message || "Could not save the result.";
    }
    return false;
  } finally {
    loading.value = false;
  }
}

async function retryHostedSync() {
  const pending = localRecord.value?.pendingMutation;
  if (!pending || !localRecord.value?.hostedSlug) return;
  loading.value = true;
  try {
    const endpoint =
      pending.kind === "result"
        ? "matches"
        : pending.kind === "swiss-round"
          ? "swiss-rounds"
          : pending.kind === "confirm-qualifiers"
            ? "qualifiers/confirm"
            : "preliminary/unlock";
    const data = await api<{ tournament: TournamentSnapshot }>(
      `/api/tournaments/${localRecord.value.hostedSlug}/${endpoint}`,
      {
        method: pending.kind === "result" ? "PATCH" : "POST",
        body: JSON.stringify(pending),
      },
    );
    localRecord.value = await indexedDbTournamentRepository.put({
      ...localRecord.value,
      snapshot: data.tournament,
      hostingStatus: "hosted",
      hostedRevision: data.tournament.revision,
      pendingMutation: undefined,
    });
    tournament.value = data.tournament;
    error.value = "";
    notice.value = "Hosted copy is back in sync.";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "The hosted copy still could not sync.";
  } finally {
    loading.value = false;
  }
}

async function undoResult() {
  if (!tournament.value) return;
  if (isLocal.value) {
    const history = [...(localRecord.value?.history ?? [])];
    const previous = history.pop();
    if (!previous) {
      error.value = "There is no result to undo.";
      return;
    }
    previous.revision = tournament.value.revision + 1;
    await saveLocalSnapshot(previous, { history });
    selectedStageId.value = previous.activeStageId ?? selectedStageId.value;
    notice.value = "Latest result undone in this browser.";
    return;
  }
  try {
    const data = await api<{ tournament: TournamentSnapshot }>(
      `/api/tournaments/${tournament.value.slug}/undo`,
      { method: "POST" },
    );
    tournament.value = data.tournament;
    selectedStageId.value =
      data.tournament.activeStageId ?? selectedStageId.value;
    notice.value = "Latest result undone.";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not undo the result.";
  }
}

async function generateSwissRound() {
  if (!tournament.value) return;
  if (isLocal.value) {
    try {
      const before = plainSnapshot(tournament.value);
      const snapshot = generateNextSwissRound(plainSnapshot(tournament.value));
      await saveLocalSnapshot(snapshot, {
        history: [...(localRecord.value?.history ?? []), before].slice(-50),
      });
      notice.value = "Next Swiss round generated.";
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Could not generate the next round.";
    }
    return;
  }
  try {
    const data = await api<{ tournament: TournamentSnapshot }>(
      `/api/tournaments/${tournament.value.slug}/swiss-rounds`,
      {
        method: "POST",
        body: JSON.stringify({ expectedRevision: tournament.value.revision }),
      },
    );
    tournament.value = data.tournament;
    selectedStageId.value = "preliminary";
    notice.value = "Next Swiss round generated.";
  } catch (err) {
    const typed = err as Error & { status?: number };
    if (typed.status !== 409 && localRecord.value) {
      const before = plainSnapshot(tournament.value);
      const snapshot = generateNextSwissRound(before);
      await saveLocalSnapshot(snapshot, {
        history: [...(localRecord.value.history ?? []), before].slice(-50),
        status: "sync-error",
        pendingMutation: {
          kind: "swiss-round",
          expectedRevision: before.revision,
        },
      });
      error.value = "Saved locally, but the hosted copy could not sync.";
    } else {
      error.value = typed.message || "Could not generate the next round.";
    }
  }
}

function selectStage(stageId: TournamentStageId) {
  selectedStageId.value = stageId;
  closeResultEditor();
  void updateConnectors();
}

function moveQualifier(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= qualifierOrder.value.length) return;
  const next = [...qualifierOrder.value];
  [next[index], next[target]] = [next[target], next[index]];
  qualifierOrder.value = next;
  if (qualificationStage.value?.cutoffTieParticipantIds.length) {
    tiesAcknowledged.value = true;
  }
}

async function confirmTournamentQualifiers() {
  if (!tournament.value) return;
  const input = {
    participantIds: qualifierOrder.value,
    acknowledgeTies: tiesAcknowledged.value,
  };
  if (isLocal.value) {
    try {
      const before = plainSnapshot(tournament.value);
      const snapshot = confirmQualifiers(before, input);
      await saveLocalSnapshot(snapshot, {
        history: [...(localRecord.value?.history ?? []), before].slice(-50),
      });
      selectedStageId.value = "knockout";
      notice.value = "Qualifiers confirmed. The knockout stage is ready.";
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Could not confirm the qualifiers.";
    }
    return;
  }
  loading.value = true;
  try {
    const data = await api<{ tournament: TournamentSnapshot }>(
      `/api/tournaments/${tournament.value.slug}/qualifiers/confirm`,
      {
        method: "POST",
        body: JSON.stringify({
          ...input,
          expectedRevision: tournament.value.revision,
        }),
      },
    );
    tournament.value = data.tournament;
    selectedStageId.value = "knockout";
    notice.value = "Qualifiers confirmed. The knockout stage is ready.";
  } catch (err) {
    const typed = err as Error & { status?: number };
    if (typed.status !== 409 && localRecord.value) {
      const before = plainSnapshot(tournament.value);
      const snapshot = confirmQualifiers(before, input);
      await saveLocalSnapshot(snapshot, {
        history: [...(localRecord.value.history ?? []), before].slice(-50),
        status: "sync-error",
        pendingMutation: {
          kind: "confirm-qualifiers",
          ...input,
          expectedRevision: before.revision,
        },
      });
      selectedStageId.value = "knockout";
      error.value = "Started locally, but the hosted copy could not sync.";
    } else {
      error.value = typed.message || "Could not confirm the qualifiers.";
    }
  } finally {
    loading.value = false;
  }
}

async function unlockTournamentStage() {
  if (
    !tournament.value ||
    !window.confirm(
      "Unlock the preliminary stage? Every knockout result will be cleared and qualifiers must be confirmed again.",
    )
  ) {
    return;
  }
  if (isLocal.value) {
    try {
      const before = plainSnapshot(tournament.value);
      const snapshot = unlockPreliminaryStage(before);
      await saveLocalSnapshot(snapshot, {
        history: [...(localRecord.value?.history ?? []), before].slice(-50),
      });
      selectedStageId.value = "qualifiers";
      notice.value = "Preliminary stage unlocked. Knockout results were reset.";
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Could not unlock the stage.";
    }
    return;
  }
  loading.value = true;
  try {
    const data = await api<{ tournament: TournamentSnapshot }>(
      `/api/tournaments/${tournament.value.slug}/preliminary/unlock`,
      {
        method: "POST",
        body: JSON.stringify({ expectedRevision: tournament.value.revision }),
      },
    );
    tournament.value = data.tournament;
    selectedStageId.value = "qualifiers";
    notice.value = "Preliminary stage unlocked. Knockout results were reset.";
  } catch (err) {
    const typed = err as Error & { status?: number };
    if (typed.status !== 409 && localRecord.value) {
      const before = plainSnapshot(tournament.value);
      const snapshot = unlockPreliminaryStage(before);
      await saveLocalSnapshot(snapshot, {
        history: [...(localRecord.value.history ?? []), before].slice(-50),
        status: "sync-error",
        pendingMutation: {
          kind: "unlock-preliminary",
          expectedRevision: before.revision,
        },
      });
      selectedStageId.value = "qualifiers";
      error.value = "Unlocked locally, but the hosted copy could not sync.";
    } else {
      error.value = typed.message || "Could not unlock the stage.";
    }
  } finally {
    loading.value = false;
  }
}

async function updateRetention() {
  if (!tournament.value) return;
  try {
    const data = await api<{ tournament: TournamentSnapshot }>(
      `/api/tournaments/${tournament.value.slug}/retention`,
      {
        method: "PATCH",
        body: JSON.stringify({
          retentionDays: retentionChoice.value,
          expectedRevision: tournament.value.revision,
        }),
      },
    );
    tournament.value = data.tournament;
    notice.value = "Retention updated.";
  } catch (err) {
    const typed = err as Error & { code?: string };
    if (typed.code === "ACCOUNT_REQUIRED") {
      signIn(`/t/${tournament.value.slug}/manage`);
      return;
    }
    error.value = typed.message;
  }
}

async function deleteTournament() {
  if (!tournament.value || !window.confirm("Permanently delete this tournament?")) return;
  try {
    if (isLocal.value && localRecord.value) {
      await indexedDbTournamentRepository.delete(localRecord.value.localId);
      navigate("/");
      return;
    }
    await api(`/api/tournaments/${tournament.value.slug}`, { method: "DELETE" });
    navigate("/");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not delete tournament.";
  }
}

async function duplicateTournament() {
  if (!localRecord.value) return;
  try {
    const duplicate = duplicateLocalTournament(localRecord.value);
    await indexedDbTournamentRepository.put(duplicate);
    navigate(`/local/${duplicate.localId}/manage`);
    notice.value = "Local copy created.";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not duplicate this tournament.";
  }
}

function exportTournament() {
  if (!localRecord.value) return;
  const blob = new Blob([JSON.stringify(makeTournamentExport(localRecord.value), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${tournament.value?.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "tournament"}.bracket.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  notice.value = "Tournament exported.";
}

async function importTournament(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const record = parseTournamentExport(JSON.parse(await file.text()));
    await indexedDbTournamentRepository.put(record);
    navigate(`/local/${record.localId}/manage`);
    notice.value = "Tournament imported into this browser.";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not import that file.";
  } finally {
    input.value = "";
  }
}

async function hostAndShare() {
  if (!localRecord.value || !tournament.value) return;
  if (localRecord.value.hostedSlug && localRecord.value.hostingStatus === "hosted") {
    navigate(`/t/${localRecord.value.hostedSlug}/manage`);
    return;
  }
  if (!user.value) {
    sessionStorage.setItem("bracket-pending-host", localRecord.value.localId);
    signIn(`/local/${localRecord.value.localId}/manage?host=1`);
    return;
  }
  loading.value = true;
  error.value = "";
  localRecord.value = await indexedDbTournamentRepository.put({
    ...localRecord.value,
    hostingStatus: "uploading",
  });
  try {
    const data = await api<{ tournament: TournamentSnapshot; publicPath: string; managePath: string }>(
      "/api/hosted-tournaments",
      {
        method: "POST",
        body: JSON.stringify({ snapshot: tournament.value, retentionDays: 365 }),
      },
    );
    localRecord.value = await indexedDbTournamentRepository.put({
      ...localRecord.value,
      snapshot: data.tournament,
      hostingStatus: "hosted",
      hostedSlug: data.tournament.slug,
      hostedRevision: data.tournament.revision,
      pendingMutation: undefined,
    });
    sessionStorage.removeItem("bracket-pending-host");
    navigate(data.managePath);
    notice.value = "Hosted copy created. The public link is ready to share.";
  } catch (err) {
    localRecord.value = await indexedDbTournamentRepository.put({
      ...localRecord.value,
      hostingStatus: "sync-error",
    });
    error.value = err instanceof Error ? err.message : "Hosting failed. Your local tournament is unchanged.";
  } finally {
    loading.value = false;
  }
}

async function claimLegacyTournament() {
  if (!tournament.value || !slug.value) return;
  if (!user.value) {
    signIn(`/t/${slug.value}/manage?claim=1`);
    return;
  }
  try {
    await api(`/api/tournaments/${slug.value}/claim`, { method: "POST" });
    legacyHosted.value = false;
    notice.value = "Tournament claimed. It now belongs to your account.";
    await loadTournament();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not claim this tournament.";
  }
}

async function copyText(value: string, message: string) {
  await navigator.clipboard.writeText(value);
  notice.value = message;
}

function publicUrl() {
  return `${window.location.origin}/t/${slug.value}`;
}

function organizerUrl() {
  return window.location.href;
}

function requestFullscreen() {
  void document.documentElement.requestFullscreen?.();
}

function signIn(returnTo = "/account/tournaments") {
  window.location.href = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  user.value = null;
  navigate("/");
}

onMounted(async () => {
  await loadSession();
  await loadRoute();
  const pendingHost = sessionStorage.getItem("bracket-pending-host");
  if (
    user.value &&
    pendingHost &&
    pendingHost === localId.value &&
    new URLSearchParams(window.location.search).has("host")
  ) {
    await hostAndShare();
  }
  if (
    user.value &&
    legacyHosted.value &&
    route.value === "manage" &&
    new URLSearchParams(window.location.search).has("claim")
  ) {
    await claimLegacyTournament();
  }
  unsubscribeLocalChanges = indexedDbTournamentRepository.subscribe(async (event) => {
    if (event.localId !== localId.value) return;
    if (event.type === "deleted") {
      tournament.value = null;
      error.value = "This local tournament was deleted in another tab.";
      return;
    }
    const latest = await indexedDbTournamentRepository.get(event.localId);
    if (latest && latest.updatedAt > (localRecord.value?.updatedAt ?? 0)) {
      localRecord.value = latest;
      tournament.value = latest.snapshot;
      notice.value = "Updated from another tab.";
    }
  });
  window.addEventListener("keydown", handleWindowKeydown);
});

onBeforeUnmount(() => {
  window.clearInterval(versionTimer);
  unsubscribeLocalChanges();
  window.removeEventListener("keydown", handleWindowKeydown);
  document.body.classList.remove("modal-open");
});


watch(
  () => vueRoute.fullPath,
  () => {
    error.value = "";
    notice.value = "";
    void loadRoute();
  },
);

watch(tournament, (value) => {
  if (value) {
    if (!stageItems.value.some((stage) => stage.id === selectedStageId.value)) {
      selectedStageId.value = value.activeStageId ?? "preliminary";
    }
    const proposed = value.stages?.qualification?.proposedParticipantIds ?? [];
    const sameOrder =
      qualifierOrder.value.length === proposed.length &&
      qualifierOrder.value.every((participantId, index) => participantId === proposed[index]);
    if (!sameOrder && value.stages?.qualification?.status === "review") {
      qualifierOrder.value = [...proposed];
      tiesAcknowledged.value = false;
    }
  }
  void updateConnectors();
});


  return {
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
    displayedMatches,
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
  };
}
