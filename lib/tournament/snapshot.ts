import type { CreateTournamentInput, PointsConfig, PreliminaryStage, TournamentSnapshot } from "./types";
import { buildDouble, buildSingle } from "./elimination";
import { buildGroupsStage, buildRoundRobin, buildSwiss } from "./preliminary";
import { computeStandings } from "./standings";

const DEFAULT_POINTS: PointsConfig = { win: 3, draw: 1, loss: 0 };

export function syncCompatibilityProjection(snapshot: TournamentSnapshot) {
  const stages = snapshot.stages;
  if (!stages) return snapshot;
  const competition =
    snapshot.activeStageId === "knockout" && stages.knockout
      ? stages.knockout
      : stages.preliminary ?? stages.knockout;
  snapshot.matches = competition?.matches ?? [];
  snapshot.standings = stages.preliminary?.standings ?? [];
  return snapshot;
}


export function refreshPreliminaryStandings(
  snapshot: TournamentSnapshot,
  stage: PreliminaryStage,
) {
  if (stage.format === "groups") {
    stage.groupStandings = Object.fromEntries(
      (stage.groups ?? []).map((group) => {
        const participants = group.participantIds.map(
          (participantId) =>
            snapshot.participants.find(
              (participant) => participant.id === participantId,
            )!,
        );
        return [
          group.id,
          computeStandings(
            participants,
            stage.matches.filter((match) => match.groupId === group.id),
            stage.points,
          ),
        ];
      }),
    );
    stage.standings = Object.values(stage.groupStandings).flat();
  } else {
    stage.standings = computeStandings(
      snapshot.participants,
      stage.matches,
      stage.points,
    );
  }
}

export function createTournamentSnapshot(
  input: CreateTournamentInput,
): TournamentSnapshot {
  const participants = input.participantNames.map((name, index) => ({
    id: `p-${index + 1}`,
    name,
    seed: index + 1,
  }));

  const base: TournamentSnapshot = {
    schemaVersion: 2,
    id: input.id,
    slug: input.slug,
    name: input.name,
    format: input.format,
    status: "active",
    activeStageId:
      input.format === "single" || input.format === "double"
        ? "knockout"
        : "preliminary",
    participants,
    stages: {},
    matches: [],
    standings: [],
    revision: 1,
    expiresAt: input.expiresAt,
    createdAt: input.createdAt,
  };

  if (input.format === "single" || input.format === "double") {
    base.stages!.knockout = {
      id: "knockout",
      format: input.format,
      status: "active",
      matches:
        input.format === "single"
          ? buildSingle(participants)
          : buildDouble(participants),
    };
    return syncCompatibilityProjection(base);
  }

  if (input.format === "groups") {
    if (!input.groups) throw new Error("Choose the Groups settings.");
    if (!input.knockout) {
      throw new Error("Groups requires a knockout stage.");
    }
    base.stages!.preliminary = buildGroupsStage(participants, input.groups);
  } else {
    const matches =
      input.format === "round-robin"
        ? buildRoundRobin(participants)
        : buildSwiss(participants);
    base.stages!.preliminary = {
      id: "preliminary",
      format: input.format,
      status: "active",
      matches,
      standings: computeStandings(participants, matches),
      points: DEFAULT_POINTS,
      plannedRounds:
        input.format === "swiss"
          ? Math.max(1, Math.min(participants.length - 1, input.swissRounds ?? Math.ceil(Math.log2(participants.length))))
          : undefined,
    };
  }

  if (input.knockout) {
    const qualifierCount =
      input.format === "groups"
        ? (input.knockout.qualifiersPerGroup ?? 1) *
          (base.stages!.preliminary?.groups?.length ?? 0)
        : Math.min(
            participants.length,
            input.knockout.qualifierCount ?? Math.min(4, participants.length),
          );
    if (qualifierCount < 2) {
      throw new Error("At least two players must qualify.");
    }
    if (input.knockout.format === "double" && qualifierCount > 32) {
      throw new Error("Double elimination supports up to 32 qualifiers.");
    }
    base.stages!.qualification = {
      id: "qualifiers",
      status: "pending",
      qualifierCount,
      qualifiersPerGroup: input.knockout.qualifiersPerGroup,
      seeding:
        input.format === "groups"
          ? input.knockout.seeding
          : input.knockout.seeding === "cross-group"
            ? "standard"
            : input.knockout.seeding,
      randomSeed: input.knockout.randomSeed ?? 1,
      proposedParticipantIds: [],
      confirmedParticipantIds: [],
      cutoffTieParticipantIds: [],
    };
    base.stages!.knockout = {
      id: "knockout",
      format: input.knockout.format,
      status: "preview",
      matches: [],
    };
  }

  return syncCompatibilityProjection(base);
}

export function normalizeTournamentSnapshot(
  snapshot: TournamentSnapshot,
): TournamentSnapshot {
  if (snapshot.schemaVersion === 2 && snapshot.stages) {
    return syncCompatibilityProjection(snapshot);
  }
  const copy = structuredClone(snapshot);
  copy.schemaVersion = 2;
  if (copy.format === "single" || copy.format === "double") {
    copy.activeStageId = "knockout";
    copy.stages = {
      knockout: {
        id: "knockout",
        format: copy.format,
        status: copy.status === "complete" ? "complete" : "active",
        matches: copy.matches,
      },
    };
  } else {
    copy.activeStageId = "preliminary";
    copy.stages = {
      preliminary: {
        id: "preliminary",
        format: copy.format === "groups" ? "groups" : copy.format,
        status: copy.status === "complete" ? "complete" : "active",
        matches: copy.matches,
        standings: copy.standings,
        points: DEFAULT_POINTS,
        plannedRounds:
          copy.format === "swiss"
            ? new Set(copy.matches.map((match) => match.round)).size
            : undefined,
      },
    };
  }
  return syncCompatibilityProjection(copy);
}

