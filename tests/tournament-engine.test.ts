import { describe, expect, it } from "vitest";
import {
  applyResult,
  confirmQualifiers,
  createTournamentSnapshot,
  generateNextSwissRound,
  normalizeTournamentSnapshot,
  participantName,
  unlockPreliminaryStage,
  upgradeDoubleEliminationSnapshot,
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
    expect(snapshot.matches.some((match) => match.id === "grand-final-reset")).toBe(false);
    expect(
      snapshot.matches.find((match) => match.id === "grand-final")?.nextMatchId,
    ).toBeUndefined();
  });

  it("builds the full lower-bracket sequence for eight-player double elimination", () => {
    const snapshot = createTournamentSnapshot({
      id: "double-eight",
      slug: "double-eight",
      name: "Double Eight",
      format: "double",
      participantNames: ["A", "B", "C", "D", "E", "F", "G", "H"],
      createdAt: 1,
      expiresAt: 100,
    });
    const loserRounds = [
      ...new Set(
        snapshot.matches
          .filter((match) => match.bracket === "losers")
          .map((match) => match.roundLabel),
      ),
    ];
    expect(loserRounds).toEqual([
      "Losers · Round 1",
      "Losers · Round 2",
      "Losers · Round 3",
      "Losers · Final",
    ]);
    expect(
      snapshot.matches.find((match) => match.id === "w-1-0")?.loserNextMatchId,
    ).toBe("l-1-0");
    expect(
      snapshot.matches.find((match) => match.id === "w-2-0")?.loserNextMatchId,
    ).toBe("l-3-0");
  });

  it("upgrades incomplete legacy double-elimination topology", () => {
    const legacy = tournament("double");
    const winnersFinal = legacy.matches.find((match) => match.id === "w-1-0")!;
    delete winnersFinal.loserNextMatchId;
    delete winnersFinal.loserNextSlot;
    const upgraded = upgradeDoubleEliminationSnapshot(legacy);
    expect(upgraded).not.toBe(legacy);
    expect(
      upgraded.matches.find((match) => match.id === "w-1-0")?.loserNextMatchId,
    ).toBe("l-1-0");
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

  it("creates equal seeded groups and every within-group pairing once", () => {
    const snapshot = createTournamentSnapshot({
      id: "groups",
      slug: "groups",
      name: "Group Cup",
      format: "groups",
      participantNames: ["A", "B", "C", "D", "E", "F", "G", "H"],
      groups: {
        groupCount: 2,
        assignment: "seeded",
        points: { win: 3, draw: 1, loss: 0 },
      },
      knockout: {
        format: "single",
        seeding: "cross-group",
        qualifiersPerGroup: 2,
      },
      createdAt: 1,
      expiresAt: 100,
    });
    const groups = snapshot.stages?.preliminary?.groups ?? [];
    expect(groups.map((group) => group.participantIds.length)).toEqual([4, 4]);
    expect(snapshot.matches).toHaveLength(12);
    expect(
      snapshot.matches.every((match) => {
        const group = groups.find((candidate) => candidate.id === match.groupId);
        return (
          group?.participantIds.includes(match.participantAId!) &&
          group.participantIds.includes(match.participantBId!)
        );
      }),
    ).toBe(true);
  });

  it("waits for qualifier confirmation, creates a cross-group bracket, and resets it on unlock", () => {
    let snapshot = createTournamentSnapshot({
      id: "staged-groups",
      slug: "staged-groups",
      name: "Staged Group Cup",
      format: "groups",
      participantNames: ["A", "B", "C", "D", "E", "F", "G", "H"],
      groups: { groupCount: 2, assignment: "seeded" },
      knockout: {
        format: "single",
        seeding: "cross-group",
        qualifiersPerGroup: 2,
      },
      createdAt: 1,
      expiresAt: 100,
    });
    for (const match of [...snapshot.matches]) {
      snapshot = applyResult(snapshot, {
        matchId: match.id,
        winnerId: match.participantAId,
        scoreA: 1,
        scoreB: 0,
      });
    }
    expect(snapshot.activeStageId).toBe("qualifiers");
    expect(snapshot.stages?.knockout?.matches).toHaveLength(0);

    const proposed =
      snapshot.stages?.qualification?.proposedParticipantIds ?? [];
    snapshot = confirmQualifiers(snapshot, {
      participantIds: proposed,
      acknowledgeTies: true,
    });
    expect(snapshot.activeStageId).toBe("knockout");
    const groups = snapshot.stages?.preliminary?.groups ?? [];
    const opening = snapshot.matches.filter((match) => match.round === 0);
    expect(
      opening.every((match) => {
        const groupA = groups.find((group) =>
          group.participantIds.includes(match.participantAId!),
        );
        const groupB = groups.find((group) =>
          group.participantIds.includes(match.participantBId!),
        );
        return groupA?.id !== groupB?.id;
      }),
    ).toBe(true);

    snapshot = applyResult(snapshot, {
      matchId: opening[0].id,
      winnerId: opening[0].participantAId,
      scoreA: 2,
      scoreB: 0,
    });
    snapshot = unlockPreliminaryStage(snapshot);
    expect(snapshot.activeStageId).toBe("qualifiers");
    expect(snapshot.stages?.knockout?.status).toBe("preview");
    expect(snapshot.stages?.knockout?.matches).toHaveLength(0);
    expect(snapshot.stages?.preliminary?.status).toBe("complete");
  });

  it("uses an explicit Swiss round plan before opening qualifier review", () => {
    let snapshot = createTournamentSnapshot({
      id: "swiss-plan",
      slug: "swiss-plan",
      name: "Swiss Plan",
      format: "swiss",
      participantNames: ["A", "B", "C", "D"],
      swissRounds: 2,
      knockout: {
        format: "single",
        seeding: "standard",
        qualifierCount: 2,
      },
      createdAt: 1,
      expiresAt: 100,
    });
    for (const match of [...snapshot.matches]) {
      snapshot = applyResult(snapshot, {
        matchId: match.id,
        winnerId: match.participantAId,
        scoreA: 1,
        scoreB: 0,
      });
    }
    expect(snapshot.activeStageId).toBe("preliminary");
    snapshot = generateNextSwissRound(snapshot);
    for (const match of snapshot.matches.filter((candidate) => candidate.round === 1)) {
      snapshot = applyResult(snapshot, {
        matchId: match.id,
        winnerId: match.participantAId,
        scoreA: 1,
        scoreB: 0,
      });
    }
    expect(snapshot.activeStageId).toBe("qualifiers");
  });

  it("normalizes legacy flat snapshots into schema version 2 stages", () => {
    const current = tournament("round-robin");
    const legacy = {
      ...current,
      schemaVersion: undefined,
      stages: undefined,
      activeStageId: undefined,
    };
    const normalized = normalizeTournamentSnapshot(legacy);
    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.stages?.preliminary?.matches).toHaveLength(6);
    expect(normalized.matches).toHaveLength(6);
  });
});
