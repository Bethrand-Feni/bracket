export type TournamentFormat =
  | "single"
  | "double"
  | "round-robin"
  | "swiss";

export interface Participant {
  id: string;
  name: string;
  seed: number;
}

export interface Match {
  id: string;
  round: number;
  roundLabel: string;
  position: number;
  bracket: "winners" | "losers" | "round-robin" | "swiss";
  participantAId: string | null;
  participantBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerId: string | null;
  status: "waiting" | "ready" | "complete";
  nextMatchId?: string;
  nextSlot?: "a" | "b";
  loserNextMatchId?: string;
  loserNextSlot?: "a" | "b";
}

export interface Standing {
  participantId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
}

export interface TournamentSnapshot {
  id: string;
  slug: string;
  name: string;
  format: TournamentFormat;
  status: "active" | "complete";
  participants: Participant[];
  matches: Match[];
  standings: Standing[];
  revision: number;
  expiresAt: number;
  createdAt: number;
}

function id(prefix: string, round: number, position: number) {
  return `${prefix}-${round}-${position}`;
}

function nextPowerOfTwo(value: number) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

function eliminationRoundLabel(round: number, totalRounds: number) {
  const fromFinal = totalRounds - round;
  if (fromFinal === 1) return "Final";
  if (fromFinal === 2) return "Semifinals";
  if (fromFinal === 3) return "Quarterfinals";
  return `Round ${round + 1}`;
}

function buildSingle(participants: Participant[]): Match[] {
  const size = nextPowerOfTwo(participants.length);
  const totalRounds = Math.log2(size);
  const padded = [...participants, ...Array(size - participants.length).fill(null)];
  const matches: Match[] = [];

  for (let round = 0; round < totalRounds; round += 1) {
    const count = size / 2 ** (round + 1);
    for (let position = 0; position < count; position += 1) {
      const matchId = id("w", round, position);
      const nextMatchId =
        round < totalRounds - 1 ? id("w", round + 1, Math.floor(position / 2)) : undefined;
      const nextSlot = position % 2 === 0 ? "a" : "b";
      const participantA = round === 0 ? padded[position * 2] : null;
      const participantB = round === 0 ? padded[position * 2 + 1] : null;
      matches.push({
        id: matchId,
        round,
        roundLabel: eliminationRoundLabel(round, totalRounds),
        position,
        bracket: "winners",
        participantAId: participantA?.id ?? null,
        participantBId: participantB?.id ?? null,
        scoreA: null,
        scoreB: null,
        winnerId: null,
        status:
          participantA && participantB
            ? "ready"
            : participantA || participantB
              ? "complete"
              : "waiting",
        nextMatchId,
        nextSlot,
      });
    }
  }

  autoAdvance(matches);
  return matches;
}

function buildDouble(participants: Participant[]): Match[] {
  const winners = buildSingle(participants).map((match) => ({
    ...match,
    roundLabel: `Winners · ${match.roundLabel}`,
  }));
  const opening = winners.filter((match) => match.round === 0);
  const losers: Match[] = [];
  const loserRounds = Math.max(1, Math.ceil(Math.log2(nextPowerOfTwo(participants.length))) - 1);

  for (let round = 0; round <= loserRounds; round += 1) {
    const count = Math.max(1, Math.floor(opening.length / 2 ** (round + 1)));
    for (let position = 0; position < count; position += 1) {
      const matchId = id("l", round, position);
      losers.push({
        id: matchId,
        round: winners.length ? round + 0.5 : round,
        roundLabel: round === loserRounds ? "Losers · Final" : `Losers · Round ${round + 1}`,
        position,
        bracket: "losers",
        participantAId: null,
        participantBId: null,
        scoreA: null,
        scoreB: null,
        winnerId: null,
        status: "waiting",
        nextMatchId:
          round < loserRounds ? id("l", round + 1, Math.floor(position / 2)) : undefined,
        nextSlot: position % 2 === 0 ? "a" : "b",
      });
    }
  }

  opening.forEach((match, index) => {
    const target = losers[Math.floor(index / 2)];
    if (target) {
      match.loserNextMatchId = target.id;
      match.loserNextSlot = index % 2 === 0 ? "a" : "b";
    }
  });

  const winnersFinal = winners.find(
    (match) => !match.nextMatchId && match.bracket === "winners",
  );
  const losersFinal = losers.find((match) => !match.nextMatchId);
  const grandFinal: Match = {
    id: "grand-final",
    round: Math.max(...winners.map((match) => match.round)) + 1,
    roundLabel: "Grand Final",
    position: 0,
    bracket: "winners",
    participantAId: null,
    participantBId: null,
    scoreA: null,
    scoreB: null,
    winnerId: null,
    status: "waiting",
  };
  if (winnersFinal) {
    winnersFinal.nextMatchId = grandFinal.id;
    winnersFinal.nextSlot = "a";
  }
  if (losersFinal) {
    losersFinal.nextMatchId = grandFinal.id;
    losersFinal.nextSlot = "b";
  }
  return [...winners, ...losers, grandFinal];
}

function buildRoundRobin(participants: Participant[]): Match[] {
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
          id: id("rr", round, position),
          round,
          roundLabel: `Round ${round + 1}`,
          position,
          bracket: "round-robin",
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

function buildSwiss(participants: Participant[]): Match[] {
  const half = Math.ceil(participants.length / 2);
  const matches: Match[] = [];
  for (let position = 0; position < Math.floor(participants.length / 2); position += 1) {
    matches.push({
      id: id("swiss", 0, position),
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

function autoAdvance(matches: Match[]) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of matches) {
      if (
        match.status === "complete" &&
        !match.winnerId &&
        Boolean(match.participantAId || match.participantBId)
      ) {
        match.winnerId = match.participantAId ?? match.participantBId;
      }
      if (match.status === "complete" && match.winnerId && match.nextMatchId) {
        const target = matches.find((candidate) => candidate.id === match.nextMatchId);
        if (!target) continue;
        const key = match.nextSlot === "a" ? "participantAId" : "participantBId";
        if (!target[key]) {
          target[key] = match.winnerId;
          target.status =
            target.participantAId && target.participantBId ? "ready" : "waiting";
          changed = true;
        }
      }
    }
  }
}

export function computeStandings(
  participants: Participant[],
  matches: Match[],
): Standing[] {
  const map = new Map<string, Standing>(
    participants.map((participant) => [
      participant.id,
      {
        participantId: participant.id,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        points: 0,
      },
    ]),
  );

  for (const match of matches.filter((candidate) => candidate.status === "complete")) {
    if (
      !match.participantAId ||
      !match.participantBId ||
      match.scoreA === null ||
      match.scoreB === null
    ) {
      continue;
    }
    const a = map.get(match.participantAId);
    const b = map.get(match.participantBId);
    if (!a || !b) continue;
    a.played += 1;
    b.played += 1;
    a.scoreFor += match.scoreA;
    a.scoreAgainst += match.scoreB;
    b.scoreFor += match.scoreB;
    b.scoreAgainst += match.scoreA;
    if (match.scoreA === match.scoreB) {
      a.draws += 1;
      b.draws += 1;
      a.points += 1;
      b.points += 1;
    } else if (match.scoreA > match.scoreB) {
      a.wins += 1;
      b.losses += 1;
      a.points += 3;
    } else {
      b.wins += 1;
      a.losses += 1;
      b.points += 3;
    }
  }

  return [...map.values()].sort((a, b) => {
    const diffA = a.scoreFor - a.scoreAgainst;
    const diffB = b.scoreFor - b.scoreAgainst;
    return (
      b.points - a.points ||
      diffB - diffA ||
      b.scoreFor - a.scoreFor ||
      participants.find((p) => p.id === a.participantId)!.seed -
        participants.find((p) => p.id === b.participantId)!.seed
    );
  });
}

export function createTournamentSnapshot(input: {
  id: string;
  slug: string;
  name: string;
  format: TournamentFormat;
  participantNames: string[];
  expiresAt: number;
  createdAt: number;
}): TournamentSnapshot {
  const participants = input.participantNames.map((name, index) => ({
    id: `p-${index + 1}`,
    name,
    seed: index + 1,
  }));
  const matches =
    input.format === "single"
      ? buildSingle(participants)
      : input.format === "double"
        ? buildDouble(participants)
        : input.format === "round-robin"
          ? buildRoundRobin(participants)
          : buildSwiss(participants);
  return {
    id: input.id,
    slug: input.slug,
    name: input.name,
    format: input.format,
    status: "active",
    participants,
    matches,
    standings:
      input.format === "round-robin" || input.format === "swiss"
        ? computeStandings(participants, matches)
        : [],
    revision: 1,
    expiresAt: input.expiresAt,
    createdAt: input.createdAt,
  };
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
  const copy = structuredClone(snapshot);
  const match = copy.matches.find((candidate) => candidate.id === input.matchId);
  if (!match || !match.participantAId || !match.participantBId) {
    throw new Error("This match is not ready.");
  }
  if (input.scoreA < 0 || input.scoreB < 0) {
    throw new Error("Scores cannot be negative.");
  }
  const allowsDraw = copy.format === "round-robin" || copy.format === "swiss";
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
    const target = copy.matches.find((candidate) => candidate.id === match.nextMatchId);
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
    const target = copy.matches.find(
      (candidate) => candidate.id === match.loserNextMatchId,
    );
    if (target) {
      if (match.loserNextSlot === "a") target.participantAId = loserId;
      else target.participantBId = loserId;
      target.status =
        target.participantAId && target.participantBId ? "ready" : "waiting";
    }
  }

  autoAdvance(copy.matches);
  if (copy.format === "round-robin" || copy.format === "swiss") {
    copy.standings = computeStandings(copy.participants, copy.matches);
  }
  copy.status = copy.matches.every(
    (candidate) => candidate.status === "complete" || candidate.status === "waiting",
  ) && copy.matches.some((candidate) => candidate.status === "complete")
    ? copy.matches.some((candidate) => candidate.status === "ready")
      ? "active"
      : "complete"
    : "active";
  copy.revision += 1;
  return copy;
}

export function generateNextSwissRound(
  snapshot: TournamentSnapshot,
): TournamentSnapshot {
  if (snapshot.format !== "swiss") throw new Error("This is not a Swiss tournament.");
  const currentRound = Math.max(...snapshot.matches.map((match) => match.round));
  const currentMatches = snapshot.matches.filter((match) => match.round === currentRound);
  if (currentMatches.some((match) => match.status !== "complete")) {
    throw new Error("Finish the current round before generating the next one.");
  }
  const maxRounds = Math.ceil(Math.log2(snapshot.participants.length));
  if (currentRound + 1 >= maxRounds) {
    throw new Error("All planned Swiss rounds have been generated.");
  }

  const copy = structuredClone(snapshot);
  const played = new Set(
    copy.matches
      .filter((match) => match.participantAId && match.participantBId)
      .map((match) =>
        [match.participantAId, match.participantBId].sort().join(":"),
      ),
  );
  const ordered = copy.standings.map((standing) => standing.participantId);
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
    copy.matches.push({
      id: id("swiss", nextRound, position),
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
  copy.status = "active";
  copy.revision += 1;
  return copy;
}

export function participantName(
  snapshot: TournamentSnapshot,
  participantId: string | null,
) {
  if (!participantId) return "TBD";
  return (
    snapshot.participants.find((participant) => participant.id === participantId)
      ?.name ?? "TBD"
  );
}

export const formatLabels: Record<TournamentFormat, string> = {
  single: "Single elimination",
  double: "Double elimination",
  "round-robin": "Round robin",
  swiss: "Swiss",
};
