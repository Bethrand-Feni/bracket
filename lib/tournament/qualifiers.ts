import { nextPowerOfTwo } from "./elimination";
import type { PreliminaryStage, Standing, TournamentSnapshot } from "./types";

function standingsTie(a: Standing, b: Standing) {
  return (
    a.points === b.points &&
    a.scoreFor - a.scoreAgainst === b.scoreFor - b.scoreAgainst &&
    a.scoreFor === b.scoreFor &&
    a.wins === b.wins
  );
}

function seededRandomOrder(ids: string[], seed: number) {
  const ordered = [...ids];
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  }
  return ordered;
}

function crossGroupOrder(
  snapshot: TournamentSnapshot,
  stage: PreliminaryStage,
  ids: string[],
) {
  const groups = stage.groups ?? [];
  const rankByParticipant = new Map<string, number>();
  const standingByParticipant = new Map<string, Standing>();
  for (const group of groups) {
    (stage.groupStandings?.[group.id] ?? []).forEach((standing, index) => {
      rankByParticipant.set(standing.participantId, index);
      standingByParticipant.set(standing.participantId, standing);
    });
  }
  const ranked = [...ids].sort((a, b) => {
    const rank = (rankByParticipant.get(a) ?? 99) - (rankByParticipant.get(b) ?? 99);
    if (rank) return rank;
    const standingA = standingByParticipant.get(a)!;
    const standingB = standingByParticipant.get(b)!;
    const performance =
      standingB.points - standingA.points ||
      standingB.scoreFor -
        standingB.scoreAgainst -
        (standingA.scoreFor - standingA.scoreAgainst) ||
      standingB.scoreFor - standingA.scoreFor ||
      standingB.wins - standingA.wins;
    if (performance) return performance;
    const groupA = groups.findIndex((group) => group.participantIds.includes(a));
    const groupB = groups.findIndex((group) => group.participantIds.includes(b));
    if (groupA !== groupB) return groupA - groupB;
    return (
      snapshot.participants.find((participant) => participant.id === a)!.seed -
      snapshot.participants.find((participant) => participant.id === b)!.seed
    );
  });

  const size = nextPowerOfTwo(ranked.length);
  const byeCount = size - ranked.length;
  const remaining = [...ranked];
  const seeded = Array<string>(ranked.length);
  for (let seed = 1; seed <= byeCount; seed += 1) {
    seeded[seed - 1] = remaining.shift()!;
  }
  const participantGroup = (participantId: string) =>
    groups.find((group) => group.participantIds.includes(participantId))?.id;
  for (
    let highSeed = byeCount + 1;
    highSeed <= size / 2;
    highSeed += 1
  ) {
    const high = remaining.shift();
    if (!high) break;
    let opponentIndex = -1;
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (participantGroup(remaining[index]) !== participantGroup(high)) {
        opponentIndex = index;
        break;
      }
    }
    if (opponentIndex < 0) opponentIndex = remaining.length - 1;
    const low = remaining.splice(opponentIndex, 1)[0];
    seeded[highSeed - 1] = high;
    const lowSeed = size + 1 - highSeed;
    if (lowSeed <= ranked.length) seeded[lowSeed - 1] = low;
  }
  for (const participantId of remaining) {
    const empty = seeded.findIndex((value) => !value);
    if (empty >= 0) seeded[empty] = participantId;
  }
  return seeded.filter(Boolean);
}

export function refreshQualification(snapshot: TournamentSnapshot) {
  const preliminary = snapshot.stages?.preliminary;
  const qualification = snapshot.stages?.qualification;
  if (!preliminary || !qualification) return;

  let proposed: string[] = [];
  const cutoffTies = new Set<string>();
  if (preliminary.format === "groups") {
    const perGroup = qualification.qualifiersPerGroup ?? 1;
    for (const group of preliminary.groups ?? []) {
      const standings = preliminary.groupStandings?.[group.id] ?? [];
      proposed.push(
        ...standings.slice(0, perGroup).map((standing) => standing.participantId),
      );
      if (
        standings[perGroup - 1] &&
        standings[perGroup] &&
        standingsTie(standings[perGroup - 1], standings[perGroup])
      ) {
        cutoffTies.add(standings[perGroup - 1].participantId);
        cutoffTies.add(standings[perGroup].participantId);
      }
    }
  } else {
    proposed = preliminary.standings
      .slice(0, qualification.qualifierCount)
      .map((standing) => standing.participantId);
    const cutoff = qualification.qualifierCount;
    if (
      preliminary.standings[cutoff - 1] &&
      preliminary.standings[cutoff] &&
      standingsTie(
        preliminary.standings[cutoff - 1],
        preliminary.standings[cutoff],
      )
    ) {
      cutoffTies.add(preliminary.standings[cutoff - 1].participantId);
      cutoffTies.add(preliminary.standings[cutoff].participantId);
    }
  }

  if (
    qualification.seeding === "cross-group" &&
    preliminary.format === "groups"
  ) {
    proposed = crossGroupOrder(snapshot, preliminary, proposed);
  } else if (qualification.seeding === "random") {
    proposed = seededRandomOrder(proposed, qualification.randomSeed);
  }
  qualification.proposedParticipantIds = proposed;
  qualification.qualifierCount = proposed.length;
  qualification.cutoffTieParticipantIds = [...cutoffTies];
}
