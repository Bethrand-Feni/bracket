import type { Match, Participant, PointsConfig, Standing } from "./types";

const DEFAULT_POINTS: PointsConfig = { win: 3, draw: 1, loss: 0 };

export function computeStandings(
  participants: Participant[],
  matches: Match[],
  points: PointsConfig = DEFAULT_POINTS,
): Standing[] {
  const standings = new Map<string, Standing>(participants.map((participant) => [participant.id, {
    participantId: participant.id,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    points: 0,
  }]));

  for (const match of matches.filter((candidate) => candidate.status === "complete")) {
    if (!match.participantAId || !match.participantBId || match.scoreA === null || match.scoreB === null) continue;
    const a = standings.get(match.participantAId);
    const b = standings.get(match.participantBId);
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
      a.points += points.draw;
      b.points += points.draw;
    } else if (match.scoreA > match.scoreB) {
      a.wins += 1;
      b.losses += 1;
      a.points += points.win;
      b.points += points.loss;
    } else {
      b.wins += 1;
      a.losses += 1;
      b.points += points.win;
      a.points += points.loss;
    }
  }

  return [...standings.values()].sort((a, b) => {
    const diffA = a.scoreFor - a.scoreAgainst;
    const diffB = b.scoreFor - b.scoreAgainst;
    return b.points - a.points || diffB - diffA || b.scoreFor - a.scoreFor || b.wins - a.wins ||
      participants.find((participant) => participant.id === a.participantId)!.seed -
      participants.find((participant) => participant.id === b.participantId)!.seed;
  });
}
