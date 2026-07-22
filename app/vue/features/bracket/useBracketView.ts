import { computed, type Ref } from "vue";
import { participantName, type Match, type TournamentFormat, type TournamentSnapshot, type TournamentStageId } from "../../../../lib/tournament";

export function useBracketView(input: {
  tournament: Ref<TournamentSnapshot | null>;
  displayedMatches: Ref<Match[]>;
  displayedStandings: Ref<Array<{ participantId: string; points: number }>>;
  displayedFormat: Ref<TournamentFormat>;
  preliminaryStage: Ref<TournamentSnapshot["stages"]["preliminary"] | undefined>;
  selectedStageId: Ref<TournamentStageId>;
  showUpcomingRounds: Ref<boolean>;
}) {
  const { tournament, displayedMatches, displayedStandings, displayedFormat, preliminaryStage, selectedStageId, showUpcomingRounds } = input;
  const groupBoards = computed(() => {
    const stage = preliminaryStage.value;
    if (!stage || stage.format !== "groups" || selectedStageId.value !== "preliminary") {
      return [];
    }
    return (stage.groups ?? []).map((group) => {
      const matches = stage.matches.filter((match) => match.groupId === group.id);
      const labels = [...new Set(matches.map((match) => match.roundLabel))];
      return {
        ...group,
        rounds: labels.map((label) => ({
          label,
          matches: matches.filter((match) => match.roundLabel === label),
        })),
        standings: stage.groupStandings?.[group.id] ?? [],
      };
    });
  });
  const groupedMatches = computed(() => {
    if (!tournament.value) return [];
    const labels = [...new Set(displayedMatches.value.map((match) => match.roundLabel))];
    return labels.map((label) => ({
      label,
      matches: displayedMatches.value.filter((match) => match.roundLabel === label),
    }));
  });
  const bracketSections = computed(() => {
    if (!tournament.value) return [];
    if (displayedFormat.value !== "double") {
      return [
        {
          id: "main",
          title: "",
          note: "",
          groups: groupedMatches.value,
        },
      ];
    }
    const group = (matches: Match[], bracket: "winners" | "losers") => {
      const rounds = [...new Set(matches.map((match) => match.round))]
        .sort((a, b) => a - b);
      return rounds.map((round) => {
        const roundMatches = matches.filter((match) => match.round === round);
        const isGrandFinal = roundMatches.some((match) => match.id === "grand-final");
        return {
          label: isGrandFinal
            ? "Grand Final"
            : `Round ${round + (bracket === "winners" ? 2 : 1)}`,
          matches: roundMatches,
        };
      });
    };
    const winners = displayedMatches.value.filter(
      (match) => match.bracket === "winners",
    );
    const losers = displayedMatches.value.filter(
      (match) => match.bracket === "losers",
    );
    return [
      {
        id: "winners",
        title: "Winners bracket",
        note: "The unbeaten path",
        groups: [
          { label: "", matches: [] as Match[] },
          ...group(winners, "winners"),
        ],
      },
      {
        id: "losers",
        title: "Losers bracket",
        note: "One more loss means elimination",
        groups: group(losers, "losers"),
      },
    ].filter((section) => section.groups.length);
  });
  const doubleColumns = computed(() => {
    if (!tournament.value || displayedFormat.value !== "double") return [];
    const winners = displayedMatches.value.filter(
      (match) => match.bracket === "winners" && !match.id.endsWith("grand-final"),
    );
    const losers = displayedMatches.value.filter(
      (match) => match.bracket === "losers",
    );
    const grandFinal = displayedMatches.value.find(
      (match) => match.id.endsWith("grand-final"),
    );
    const winnerRoundCount = Math.max(0, ...winners.map((match) => match.round + 1));
    const loserRoundCount = Math.max(0, ...losers.map((match) => match.round + 1));
    const winnerOffset = Math.max(0, loserRoundCount - winnerRoundCount);
    return Array.from({ length: loserRoundCount + 1 }, (_, column) => ({
      column,
      label: column === loserRoundCount ? "Grand Final" : `Round ${column + 1}`,
      winners: winners.filter((match) => match.round + winnerOffset === column),
      final: grandFinal && column === loserRoundCount ? [grandFinal] : [],
      losers: losers.filter((match) => match.round === column),
    }));
  });
  const doubleUpperHeight = computed(() => {
    const largest = Math.max(
      1,
      ...doubleColumns.value.map((column) => column.winners.length),
    );
    return Math.max(420, largest * 156);
  });
  const doubleLowerHeight = computed(() => {
    const largest = Math.max(
      1,
      ...doubleColumns.value.map((column) => column.losers.length),
    );
    return Math.max(300, largest * 156);
  });
  const activeRoundIndex = computed(() => {
    if (
      displayedFormat.value !== "round-robin" &&
      displayedFormat.value !== "swiss" &&
      displayedFormat.value !== "groups"
    ) return -1;
    const index = groupedMatches.value.findIndex((group) =>
      group.matches.some((match) => match.status !== "complete"),
    );
    return index < 0 ? groupedMatches.value.length - 1 : index;
  });
  function isGroupLocked(sectionId: string, groupIndex: number) {
    return (
      sectionId === "main" &&
      (displayedFormat.value === "round-robin" ||
        displayedFormat.value === "swiss" ||
        displayedFormat.value === "groups") &&
      !showUpcomingRounds.value &&
      groupIndex > activeRoundIndex.value
    );
  }
  function bracketCanvasHeight(
    groups: Array<{ label: string; matches: Match[] }>,
    sectionId = "main",
  ) {
    if (sectionId === "grand-final") return 390;
    const largestRound = Math.max(
      1,
      ...groups.map((group) => group.matches.length),
    );
    return Math.max(520, largestRound * 142 + 76);
  }
  const hasStandings = computed(() => Boolean(displayedStandings.value.length));
  const winner = computed(() => {
    if (!tournament.value || tournament.value.status !== "complete") return "";
    const final = [...(tournament.value.stages?.knockout?.matches ?? tournament.value.matches)]
      .reverse()
      .find((match) => match.winnerId);
    return final ? participantName(tournament.value, final.winnerId) : "";
  });
  
  
  function matchCode(match: Match) {
    if (!tournament.value) return match.id;
    if (match.id.endsWith("grand-final")) return "GF";
    const bracketMatches = displayedMatches.value
      .filter(
        (candidate) =>
          candidate.bracket === match.bracket &&
          candidate.id !== "grand-final",
      )
      .sort((a, b) => a.round - b.round || a.position - b.position);
    const index = bracketMatches.findIndex((candidate) => candidate.id === match.id);
    return `${match.bracket === "losers" ? "L" : "W"}${index + 1}`;
  }
  
  function participantSlotLabel(match: Match, slot: "a" | "b") {
    if (!tournament.value) return "TBD";
    const participantId =
      slot === "a" ? match.participantAId : match.participantBId;
    if (participantId) return participantName(tournament.value, participantId);
  
    const winnerSource = displayedMatches.value.find(
      (candidate) =>
        candidate.nextMatchId === match.id && candidate.nextSlot === slot,
    );
    if (winnerSource) return `Winner of ${matchCode(winnerSource)}`;
  
    const loserSource = displayedMatches.value.find(
      (candidate) =>
        candidate.loserNextMatchId === match.id &&
        candidate.loserNextSlot === slot,
    );
    if (loserSource) return `Loser of ${matchCode(loserSource)}`;
    return "TBD";
  }
  
  return {
    groupBoards,
    groupedMatches,
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
  };
}

