import type { GroupsSetup, Match, Participant, PointsConfig, PreliminaryStage, TournamentGroup } from "./types";
import { computeStandings } from "./standings";
import { matchId } from "./ids";

const DEFAULT_POINTS: PointsConfig = { win: 3, draw: 1, loss: 0 };

export function buildRoundRobin(
  participants: Participant[],
  options: { prefix?: string; bracket?: Match["bracket"]; groupId?: string } = {},
): Match[] {
  const rotating: Array<Participant | null> = [...participants];
  if (rotating.length % 2) rotating.push(null);
  const rounds = rotating.length - 1;
  const half = rotating.length / 2;
  const matches: Match[] = [];

  for (let round = 0; round < rounds; round += 1) {
    for (let position = 0; position < half; position += 1) {
      const a = rotating[position];
      const b = rotating[rotating.length - 1 - position];
      if (a && b) {
        matches.push({
          id: matchId(options.prefix ?? "rr", round, position),
          round,
          roundLabel: `Round ${round + 1}`,
          position,
          bracket: options.bracket ?? "round-robin",
          groupId: options.groupId,
          participantAId: a.id,
          participantBId: b.id,
          scoreA: null,
          scoreB: null,
          winnerId: null,
          status: "ready",
        });
      }
    }
    rotating.splice(1, 0, rotating.pop() ?? null);
  }
  return matches;
}

export function buildSwiss(participants: Participant[]): Match[] {
  const half = Math.ceil(participants.length / 2);
  const matches: Match[] = [];
  for (
    let position = 0;
    position < Math.floor(participants.length / 2);
    position += 1
  ) {
    matches.push({
      id: matchId("swiss", 0, position),
      round: 0,
      roundLabel: "Round 1",
      position,
      bracket: "swiss",
      participantAId: participants[position]?.id ?? null,
      participantBId: participants[position + half]?.id ?? null,
      scoreA: null,
      scoreB: null,
      winnerId: null,
      status: "ready",
    });
  }
  return matches;
}

function groupLabel(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return `Group ${label}`;
}

function assignGroups(
  participants: Participant[],
  setup: GroupsSetup,
): TournamentGroup[] {
  if (
    setup.groupCount < 2 ||
    participants.length % setup.groupCount !== 0 ||
    participants.length / setup.groupCount < 2 ||
    participants.length / setup.groupCount > 16
  ) {
    throw new Error(
      "Choose a group count that divides the participants into equal groups of 2–16.",
    );
  }
  const groups = Array.from({ length: setup.groupCount }, (_, index) => ({
    id: `group-${index + 1}`,
    label: groupLabel(index),
    participantIds: [] as string[],
  }));
  const capacity = participants.length / setup.groupCount;

  if (setup.assignment === "manual") {
    for (const participant of participants) {
      const groupId = setup.manualAssignments?.[participant.id];
      const target = groups.find((group) => group.id === groupId);
      if (!target) {
        throw new Error(`Choose a group for ${participant.name}.`);
      }
      target.participantIds.push(participant.id);
    }
    if (groups.some((group) => group.participantIds.length !== capacity)) {
      throw new Error(`Every group must contain exactly ${capacity} players.`);
    }
    return groups;
  }

  const ordered = [...participants];
  if (setup.assignment === "random") {
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
      const target = Math.floor(random * (index + 1));
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    }
    ordered.forEach((participant, index) => {
      groups[index % setup.groupCount].participantIds.push(participant.id);
    });
    return groups;
  }

  ordered.forEach((participant, index) => {
    const row = Math.floor(index / setup.groupCount);
    const withinRow = index % setup.groupCount;
    const groupIndex =
      row % 2 === 0 ? withinRow : setup.groupCount - 1 - withinRow;
    groups[groupIndex].participantIds.push(participant.id);
  });
  return groups;
}

export function buildGroupsStage(
  participants: Participant[],
  setup: GroupsSetup,
): PreliminaryStage {
  const groups = assignGroups(participants, setup);
  const matches = groups.flatMap((group, groupIndex) =>
    buildRoundRobin(
      group.participantIds.map(
        (participantId) =>
          participants.find((participant) => participant.id === participantId)!,
      ),
      {
        prefix: `group-${groupIndex + 1}`,
        bracket: "group",
        groupId: group.id,
      },
    ),
  );
  const points = setup.points ?? DEFAULT_POINTS;
  return {
    id: "preliminary",
    format: "groups",
    status: "active",
    matches,
    standings: [],
    groups,
    groupStandings: Object.fromEntries(
      groups.map((group) => [
        group.id,
        computeStandings(
          group.participantIds.map(
            (participantId) =>
              participants.find((participant) => participant.id === participantId)!,
          ),
          matches.filter((match) => match.groupId === group.id),
          points,
        ),
      ]),
    ),
    points,
  };
}

