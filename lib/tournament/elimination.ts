import type { Match, Participant } from "./types";
import { autoAdvance } from "./advance";
import { matchId } from "./ids";

export function nextPowerOfTwo(value: number) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

function eliminationRoundLabel(round: number, totalRounds: number) {
  const fromFinal = totalRounds - round;
  if (fromFinal === 1) return "Final";
  if (fromFinal === 2) return "Semifinals";
  if (fromFinal === 3) return "Quarterfinals";
  return `Round ${round + 1}`;
}

function bracketSeedPositions(size: number) {
  let positions = [1, 2];
  while (positions.length < size) {
    const nextSize = positions.length * 2 + 1;
    positions = positions.flatMap((seed) => [seed, nextSize - seed]);
  }
  return positions;
}

function seededSlots(participants: Participant[]) {
  const size = nextPowerOfTwo(participants.length);
  return bracketSeedPositions(size).map(
    (seed) => participants[seed - 1] ?? null,
  );
}

export function buildSingle(participants: Participant[], prefix = ""): Match[] {
  const padded = seededSlots(participants);
  const size = padded.length;
  const totalRounds = Math.log2(size);
  const matches: Match[] = [];

  for (let round = 0; round < totalRounds; round += 1) {
    const count = size / 2 ** (round + 1);
    for (let position = 0; position < count; position += 1) {
      const currentMatchId = matchId(`${prefix}w`, round, position);
      const nextMatchId =
        round < totalRounds - 1
          ? matchId(`${prefix}w`, round + 1, Math.floor(position / 2))
          : undefined;
      const participantA = round === 0 ? padded[position * 2] : null;
      const participantB = round === 0 ? padded[position * 2 + 1] : null;
      matches.push({
        id: currentMatchId,
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
        nextSlot: position % 2 === 0 ? "a" : "b",
      });
    }
  }

  autoAdvance(matches);
  return matches;
}

export function buildDouble(participants: Participant[], prefix = ""): Match[] {
  const size = nextPowerOfTwo(participants.length);
  const totalWinnerRounds = Math.log2(size);
  const winners = buildSingle(participants, prefix).map((match) => ({
    ...match,
    roundLabel: `Winners · ${match.roundLabel}`,
  }));
  const losers: Match[] = [];

  const loserId = (round: number, position: number) =>
    matchId(`${prefix}l`, round, position);
  const makeLoserMatch = (
    round: number,
    position: number,
    finalRound: number,
  ): Match => ({
    id: loserId(round, position),
    round,
    roundLabel:
      round === finalRound ? "Losers · Final" : `Losers · Round ${round + 1}`,
    position,
    bracket: "losers",
    participantAId: null,
    participantBId: null,
    scoreA: null,
    scoreB: null,
    winnerId: null,
    status: "waiting",
  });

  const finalLoserRound = Math.max(0, (totalWinnerRounds - 1) * 2 - 1);

  for (let stage = 0; stage < totalWinnerRounds - 1; stage += 1) {
    const minorRound = stage * 2;
    const majorRound = minorRound + 1;
    const count = size / 2 ** (stage + 2);

    for (let position = 0; position < count; position += 1) {
      const minor = makeLoserMatch(minorRound, position, finalLoserRound);
      const major = makeLoserMatch(majorRound, position, finalLoserRound);
      minor.nextMatchId = major.id;
      minor.nextSlot = "a";
      if (majorRound < finalLoserRound) {
        major.nextMatchId = loserId(
          majorRound + 1,
          Math.floor(position / 2),
        );
        major.nextSlot = position % 2 === 0 ? "a" : "b";
      }
      losers.push(minor, major);
    }

    winners
      .filter((match) => match.round === stage + 1)
      .forEach((match) => {
        match.loserNextMatchId = loserId(majorRound, match.position);
        match.loserNextSlot = "b";
      });
  }

  winners
    .filter((match) => match.round === 0)
    .forEach((match) => {
      match.loserNextMatchId = loserId(
        0,
        Math.floor(match.position / 2),
      );
      match.loserNextSlot = match.position % 2 === 0 ? "a" : "b";
    });

  const grandFinalId = `${prefix}grand-final`;
  const grandFinal: Match = {
    id: grandFinalId,
    round: totalWinnerRounds,
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
  const winnersFinal = winners.find(
    (match) => match.round === totalWinnerRounds - 1,
  );
  const losersFinal = losers.find(
    (match) => match.id === loserId(finalLoserRound, 0),
  );
  if (winnersFinal) {
    winnersFinal.nextMatchId = grandFinal.id;
    winnersFinal.nextSlot = "a";
    if (!losersFinal) {
      winnersFinal.loserNextMatchId = grandFinal.id;
      winnersFinal.loserNextSlot = "b";
    }
  }
  if (losersFinal) {
    losersFinal.nextMatchId = grandFinal.id;
    losersFinal.nextSlot = "b";
  }

  const matches = [...winners, ...losers, grandFinal];
  autoAdvance(matches);
  return matches;
}
