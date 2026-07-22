import type {
  KnockoutStage,
  PreliminaryStage,
  TournamentSnapshot,
  TournamentStageId,
} from "./tournament/types";
import { autoAdvance } from "./tournament/advance";
import { buildDouble, buildSingle, nextPowerOfTwo } from "./tournament/elimination";
import { matchId } from "./tournament/ids";
import { refreshQualification } from "./tournament/qualifiers";
import {
  createTournamentSnapshot,
  normalizeTournamentSnapshot,
  refreshPreliminaryStandings,
  syncCompatibilityProjection,
} from "./tournament/snapshot";

export type * from "./tournament/types";
export { computeStandings } from "./tournament/standings";
export { formatLabels, participantName } from "./tournament/selectors";
export { createTournamentSnapshot, normalizeTournamentSnapshot } from "./tournament/snapshot";




function stageIsComplete(stage: PreliminaryStage | KnockoutStage) {
  if (stage.id === "preliminary") {
    if (stage.format === "swiss") {
      const generatedRounds = new Set(stage.matches.map((match) => match.round)).size;
      return (
        generatedRounds >= (stage.plannedRounds ?? 1) &&
        stage.matches.every((match) => match.status === "complete")
      );
    }
    return (
      stage.matches.length > 0 &&
      stage.matches.every((match) => match.status === "complete")
    );
  }
  const final =
    stage.format === "double"
      ? stage.matches.find((match) => match.id.endsWith("grand-final"))
      : [...stage.matches].sort((a, b) => b.round - a.round)[0];
  return final?.status === "complete";
}


function activeCompetitionStage(snapshot: TournamentSnapshot) {
  const stages = snapshot.stages!;
  return snapshot.activeStageId === "knockout"
    ? stages.knockout
    : stages.preliminary;
}

export function applyResult(
  snapshot: TournamentSnapshot,
  input: {
    matchId: string;
    winnerId?: string | null;
    scoreA: number;
    scoreB: number;
  },
): TournamentSnapshot {
  const copy = normalizeTournamentSnapshot(structuredClone(snapshot));
  const stage = activeCompetitionStage(copy);
  const match = stage?.matches.find((candidate) => candidate.id === input.matchId);
  if (!stage || !match || !match.participantAId || !match.participantBId) {
    throw new Error("This match is not ready.");
  }
  if (stage.id === "preliminary" && stage.status === "locked") {
    throw new Error("Unlock the preliminary stage before editing its results.");
  }
  if (input.scoreA < 0 || input.scoreB < 0) {
    throw new Error("Scores cannot be negative.");
  }
  const allowsDraw = stage.id === "preliminary";
  if (!allowsDraw && input.scoreA === input.scoreB && !input.winnerId) {
    throw new Error("Elimination matches require a winner.");
  }

  match.scoreA = input.scoreA;
  match.scoreB = input.scoreB;
  match.winnerId =
    input.winnerId ??
    (input.scoreA === input.scoreB
      ? null
      : input.scoreA > input.scoreB
        ? match.participantAId
        : match.participantBId);
  match.status = "complete";

  if (match.nextMatchId && match.winnerId) {
    const target = stage.matches.find(
      (candidate) => candidate.id === match.nextMatchId,
    );
    if (target) {
      if (match.nextSlot === "a") target.participantAId = match.winnerId;
      else target.participantBId = match.winnerId;
      target.status =
        target.participantAId && target.participantBId ? "ready" : "waiting";
    }
  }
  if (match.loserNextMatchId && match.winnerId) {
    const loserId =
      match.winnerId === match.participantAId
        ? match.participantBId
        : match.participantAId;
    const target = stage.matches.find(
      (candidate) => candidate.id === match.loserNextMatchId,
    );
    if (target) {
      if (match.loserNextSlot === "a") target.participantAId = loserId;
      else target.participantBId = loserId;
      target.status =
        target.participantAId && target.participantBId ? "ready" : "waiting";
    }
  }
  autoAdvance(stage.matches);

  if (stage.id === "preliminary") {
    refreshPreliminaryStandings(copy, stage);
    if (stageIsComplete(stage)) {
      stage.status = "complete";
      if (copy.stages?.qualification) {
        copy.stages.qualification.status = "review";
        refreshQualification(copy);
        copy.activeStageId = "qualifiers";
      } else {
        copy.status = "complete";
      }
    } else {
      stage.status = "active";
      if (copy.stages?.qualification) {
        copy.stages.qualification.status = "pending";
        copy.stages.qualification.proposedParticipantIds = [];
      }
      copy.activeStageId = "preliminary";
      copy.status = "active";
    }
  } else if (stageIsComplete(stage)) {
    stage.status = "complete";
    copy.status = "complete";
  }

  copy.revision += 1;
  return syncCompatibilityProjection(copy);
}

export function generateNextSwissRound(
  snapshot: TournamentSnapshot,
): TournamentSnapshot {
  const copy = normalizeTournamentSnapshot(structuredClone(snapshot));
  const stage = copy.stages?.preliminary;
  if (!stage || stage.format !== "swiss") {
    throw new Error("This is not a Swiss tournament.");
  }
  if (stage.status === "locked") {
    throw new Error("The preliminary stage is locked.");
  }
  const currentRound = Math.max(...stage.matches.map((match) => match.round));
  const currentMatches = stage.matches.filter(
    (match) => match.round === currentRound,
  );
  if (currentMatches.some((match) => match.status !== "complete")) {
    throw new Error("Finish the current round before generating the next one.");
  }
  if (currentRound + 1 >= (stage.plannedRounds ?? 1)) {
    throw new Error("All planned Swiss rounds have been generated.");
  }

  const played = new Set(
    stage.matches
      .filter((match) => match.participantAId && match.participantBId)
      .map((match) =>
        [match.participantAId, match.participantBId].sort().join(":"),
      ),
  );
  const ordered = stage.standings.map((standing) => standing.participantId);
  const unpaired = [...ordered];
  const nextRound = currentRound + 1;
  let position = 0;
  while (unpaired.length >= 2) {
    const a = unpaired.shift()!;
    let opponentIndex = unpaired.findIndex(
      (candidate) => !played.has([a, candidate].sort().join(":")),
    );
    if (opponentIndex < 0) opponentIndex = 0;
    const b = unpaired.splice(opponentIndex, 1)[0];
    stage.matches.push({
      id: matchId("swiss", nextRound, position),
      round: nextRound,
      roundLabel: `Round ${nextRound + 1}`,
      position,
      bracket: "swiss",
      participantAId: a,
      participantBId: b,
      scoreA: null,
      scoreB: null,
      winnerId: null,
      status: "ready",
    });
    position += 1;
  }
  stage.status = "active";
  copy.activeStageId = "preliminary";
  copy.status = "active";
  copy.revision += 1;
  return syncCompatibilityProjection(copy);
}

export function confirmQualifiers(
  snapshot: TournamentSnapshot,
  input: {
    participantIds: string[];
    acknowledgeTies?: boolean;
  },
): TournamentSnapshot {
  const copy = normalizeTournamentSnapshot(structuredClone(snapshot));
  const preliminary = copy.stages?.preliminary;
  const qualification = copy.stages?.qualification;
  const knockout = copy.stages?.knockout;
  if (
    !preliminary ||
    !qualification ||
    !knockout ||
    qualification.status !== "review"
  ) {
    throw new Error("Qualifiers are not ready to confirm.");
  }
  const expected = [...qualification.proposedParticipantIds].sort();
  const received = [...input.participantIds];
  if (
    received.length !== expected.length ||
    new Set(received).size !== received.length ||
    [...received].sort().join(":") !== expected.join(":")
  ) {
    throw new Error("Confirm every proposed qualifier exactly once.");
  }
  if (
    qualification.cutoffTieParticipantIds.length &&
    !input.acknowledgeTies
  ) {
    throw new Error("Resolve or acknowledge the qualification cutoff tie.");
  }

  const qualifierParticipants = received.map((participantId, index) => ({
    ...copy.participants.find(
      (participant) => participant.id === participantId,
    )!,
    seed: index + 1,
  }));
  knockout.matches =
    knockout.format === "single"
      ? buildSingle(qualifierParticipants, "ko-")
      : buildDouble(qualifierParticipants, "ko-");
  knockout.status = "active";
  qualification.status = "confirmed";
  qualification.confirmedParticipantIds = received;
  preliminary.status = "locked";
  copy.activeStageId = "knockout";
  copy.status = "active";
  copy.revision += 1;
  return syncCompatibilityProjection(copy);
}

export function unlockPreliminaryStage(
  snapshot: TournamentSnapshot,
): TournamentSnapshot {
  const copy = normalizeTournamentSnapshot(structuredClone(snapshot));
  const preliminary = copy.stages?.preliminary;
  const qualification = copy.stages?.qualification;
  const knockout = copy.stages?.knockout;
  if (!preliminary || !qualification || !knockout) {
    throw new Error("This tournament has no preliminary stage to unlock.");
  }
  if (preliminary.status !== "locked") {
    throw new Error("The preliminary stage is already unlocked.");
  }
  preliminary.status = "complete";
  qualification.status = "review";
  qualification.confirmedParticipantIds = [];
  knockout.status = "preview";
  knockout.matches = [];
  refreshQualification(copy);
  copy.activeStageId = "qualifiers";
  copy.status = "active";
  copy.revision += 1;
  return syncCompatibilityProjection(copy);
}

export function stageMatches(
  snapshot: TournamentSnapshot,
  stageId: TournamentStageId,
) {
  const normalized = normalizeTournamentSnapshot(snapshot);
  if (stageId === "preliminary") {
    return normalized.stages?.preliminary?.matches ?? [];
  }
  if (stageId === "knockout") {
    return normalized.stages?.knockout?.matches ?? [];
  }
  return [];
}

export function stageStandings(
  snapshot: TournamentSnapshot,
  stageId: TournamentStageId,
) {
  const normalized = normalizeTournamentSnapshot(snapshot);
  return stageId === "preliminary"
    ? normalized.stages?.preliminary?.standings ?? []
    : [];
}

export function upgradeDoubleEliminationSnapshot(
  snapshot: TournamentSnapshot,
): TournamentSnapshot {
  if (snapshot.format !== "double") return normalizeTournamentSnapshot(snapshot);
  const normalized = normalizeTournamentSnapshot(snapshot);
  const matches = normalized.stages?.knockout?.matches ?? normalized.matches;
  const size = nextPowerOfTwo(normalized.participants.length);
  const winnerRounds = Math.log2(size);
  const expectedLoserRounds = Math.max(0, (winnerRounds - 1) * 2);
  const actualLoserRounds = new Set(
    matches
      .filter((match) => match.bracket === "losers")
      .map((match) => match.roundLabel),
  ).size;
  const winnersFinal = matches.find(
    (match) =>
      match.bracket === "winners" &&
      !match.id.endsWith("grand-final") &&
      match.round === winnerRounds - 1,
  );
  if (
    actualLoserRounds === expectedLoserRounds &&
    (expectedLoserRounds === 0 || Boolean(winnersFinal?.loserNextMatchId)) &&
    !matches.some((match) => match.id.endsWith("grand-final-reset"))
  ) {
    return normalized;
  }

  let rebuilt = createTournamentSnapshot({
    id: normalized.id,
    slug: normalized.slug,
    name: normalized.name,
    format: "double",
    participantNames: [...normalized.participants]
      .sort((a, b) => a.seed - b.seed)
      .map((participant) => participant.name),
    expiresAt: normalized.expiresAt,
    createdAt: normalized.createdAt,
  });
  const completed = matches
    .filter(
      (match) =>
        match.status === "complete" &&
        match.participantAId &&
        match.participantBId &&
        match.scoreA !== null &&
        match.scoreB !== null,
    )
    .sort(
      (a, b) =>
        Number(a.bracket === "losers") -
          Number(b.bracket === "losers") ||
        a.round - b.round ||
        a.position - b.position,
    );
  for (const previous of completed) {
    const target = rebuilt.matches.find((match) => match.id === previous.id);
    if (
      !target ||
      !target.participantAId ||
      !target.participantBId ||
      [previous.participantAId, previous.participantBId].sort().join(":") !==
        [target.participantAId, target.participantBId].sort().join(":")
    ) {
      continue;
    }
    try {
      rebuilt = applyResult(rebuilt, {
        matchId: target.id,
        winnerId: previous.winnerId,
        scoreA: previous.scoreA!,
        scoreB: previous.scoreB!,
      });
    } catch {
      // Keep every compatible legacy result and leave the rest ready to replay.
    }
  }
  rebuilt.revision = normalized.revision + 1;
  return rebuilt;
}
