import { computed, ref, type ComputedRef } from "vue";
import type { Match } from "../../../../lib/tournament";

type ScoreDraft = { a: number; b: number };

export function useResultEditor(
  matches: ComputedRef<Match[]>,
  editable: ComputedRef<boolean>,
  record: (
    match: Match,
    winnerId: string | null,
    draw: boolean,
    scores: ScoreDraft,
  ) => Promise<boolean>,
) {
  const drafts = ref<Record<string, ScoreDraft>>({});
  const editingMatchId = ref("");
  const editingMatch = computed(
    () => matches.value.find(({ id }) => id === editingMatchId.value) ?? null,
  );

  function draftFor(match: Match) {
    drafts.value[match.id] ??= { a: match.scoreA ?? 0, b: match.scoreB ?? 0 };
    return drafts.value[match.id];
  }

  function open(match: Match, preferredWinnerId?: string | null) {
    if (!editable.value || match.status === "waiting") return;
    const currentA = match.scoreA ?? 0;
    const currentB = match.scoreB ?? 0;
    drafts.value[match.id] =
      preferredWinnerId === match.participantAId
        ? { a: Math.max(1, currentA), b: 0 }
        : preferredWinnerId === match.participantBId
          ? { a: 0, b: Math.max(1, currentB) }
          : { a: currentA, b: currentB };
    editingMatchId.value = match.id;
  }

  function close() {
    editingMatchId.value = "";
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && editingMatchId.value) close();
  }

  async function save(match: Match) {
    const draft = draftFor(match);
    const winnerId =
      draft.a === draft.b
        ? null
        : draft.a > draft.b
          ? match.participantAId
          : match.participantBId;
    if (await record(match, winnerId, draft.a === draft.b, draft)) close();
  }

  return { drafts, editingMatch, draftFor, open, close, handleKeydown, save };
}
