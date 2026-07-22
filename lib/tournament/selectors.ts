import type { TournamentFormat, TournamentSnapshot } from "./types";

export function participantName(snapshot: TournamentSnapshot, participantId: string | null) {
  if (!participantId) return "TBD";
  return snapshot.participants.find((participant) => participant.id === participantId)?.name ?? "TBD";
}

export const formatLabels: Record<TournamentFormat, string> = {
  single: "Single elimination",
  double: "Double elimination",
  "round-robin": "Round robin",
  swiss: "Swiss",
  groups: "Groups",
};
