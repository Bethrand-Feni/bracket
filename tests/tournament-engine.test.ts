import { describe, expect, it } from "vitest";
import {
  applyResult,
  createTournamentSnapshot,
  generateNextSwissRound,
  participantName,
} from "../lib/tournament";

function tournament(format: "single" | "double" | "round-robin" | "swiss") {
  return createTournamentSnapshot({
    id: "test",
    slug: "test-slug",
    name: "Saturday Game Night",
    format,
    participantNames: ["Ava", "Noah", "Mia", "Leo"],
    createdAt: 1,
    expiresAt: 100,
  });
}

describe("tournament engines", () => {
  it("creates a single-elimination bracket and advances a winner", () => {
    const snapshot = tournament("single");
    const opening = snapshot.matches.find((match) => match.status === "ready")!;
    const updated = applyResult(snapshot, {
      matchId: opening.id,
      winnerId: opening.participantAId,
      scoreA: 2,
      scoreB: 0,
    });
    const next = updated.matches.find((match) => match.id === opening.nextMatchId);
    expect(next?.participantAId ?? next?.participantBId).toBe(opening.participantAId);
    expect(updated.revision).toBe(2);
  });

  it("creates winners, losers, and grand-final sections for double elimination", () => {
    const snapshot = tournament("double");
    expect(snapshot.matches.some((match) => match.bracket === "losers")).toBe(true);
    expect(snapshot.matches.some((match) => match.id === "grand-final")).toBe(true);
  });

  it("builds every round-robin pairing once", () => {
    const snapshot = tournament("round-robin");
    expect(snapshot.matches).toHaveLength(6);
    const pairs = new Set(
      snapshot.matches.map((match) =>
        [match.participantAId, match.participantBId].sort().join(":"),
      ),
    );
    expect(pairs.size).toBe(6);
  });

  it("records a draw and recalculates standings", () => {
    const snapshot = tournament("round-robin");
    const match = snapshot.matches[0];
    const updated = applyResult(snapshot, {
      matchId: match.id,
      winnerId: null,
      scoreA: 1,
      scoreB: 1,
    });
    expect(updated.standings[0].points).toBe(1);
    expect(updated.standings[1].points).toBe(1);
  });

  it("pairs the top and lower halves for the first Swiss round", () => {
    const snapshot = tournament("swiss");
    expect(snapshot.matches).toHaveLength(2);
    expect(participantName(snapshot, snapshot.matches[0].participantAId)).toBe("Ava");
    expect(participantName(snapshot, snapshot.matches[0].participantBId)).toBe("Mia");
  });

  it("generates a later Swiss round without repeating the opening pairings", () => {
    let snapshot = tournament("swiss");
    for (const match of snapshot.matches) {
      snapshot = applyResult(snapshot, {
        matchId: match.id,
        winnerId: match.participantAId,
        scoreA: 1,
        scoreB: 0,
      });
    }
    const next = generateNextSwissRound(snapshot);
    const firstPairs = new Set(
      snapshot.matches.map((match) =>
        [match.participantAId, match.participantBId].sort().join(":"),
      ),
    );
    const laterPairs = next.matches
      .filter((match) => match.round === 1)
      .map((match) => [match.participantAId, match.participantBId].sort().join(":"));
    expect(laterPairs.every((pair) => !firstPairs.has(pair))).toBe(true);
  });

  it("rejects tied elimination scores without an explicit winner", () => {
    const snapshot = tournament("single");
    const opening = snapshot.matches.find((match) => match.status === "ready")!;
    expect(() =>
      applyResult(snapshot, {
        matchId: opening.id,
        winnerId: null,
        scoreA: 1,
        scoreB: 1,
      }),
    ).toThrow("require a winner");
  });
});
