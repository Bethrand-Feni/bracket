import type { Match } from "./types";

export function autoAdvance(matches: Match[]) {
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
        const target = matches.find(
          (candidate) => candidate.id === match.nextMatchId,
        );
        if (!target) continue;
        const key =
          match.nextSlot === "a" ? "participantAId" : "participantBId";
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

