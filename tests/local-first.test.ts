import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import {
  duplicateLocalTournament,
  makeTournamentExport,
  parseTournamentExport,
  type LocalTournamentRecord,
} from "../app/local-tournaments";
import { createTournamentSnapshot } from "../lib/tournament";
import { handleApi, type ApiEnv } from "../worker/api";

function localRecord(): LocalTournamentRecord {
  const now = Date.now();
  const localId = crypto.randomUUID();
  return {
    localId,
    snapshot: createTournamentSnapshot({
      id: localId,
      slug: localId,
      name: "Offline Finals",
      format: "single",
      participantNames: ["Ava", "Noah", "Mia", "Leo"],
      expiresAt: 0,
      createdAt: now,
    }),
    hostingStatus: "hosted",
    hostedSlug: "public-copy",
    hostedRevision: 4,
    createdAt: now,
    updatedAt: now,
    history: [],
  };
}

function schemaOnlyEnv() {
  const statement = {
    bind() {
      return this;
    },
    first: async () => null,
    run: async () => ({ success: true, meta: { changes: 0 } }),
  };
  const DB = {
    prepare: () => statement,
    batch: async (queries: unknown[]) =>
      queries.map(() => ({ success: true, meta: { changes: 0 } })),
  };
  return { DB: DB as unknown as D1Database } satisfies ApiEnv;
}

describe("local-first persistence boundary", () => {
  it("exports an independent local backup without hosted ownership metadata", () => {
    const exported = makeTournamentExport(localRecord());
    expect(exported.version).toBe(2);
    expect(exported.tournament.snapshot.schemaVersion).toBe(2);
    expect(exported.tournament.hostingStatus).toBe("local");
    expect(exported.tournament.hostedSlug).toBeUndefined();
    expect(exported.tournament.hostedRevision).toBeUndefined();
  });

  it("imports and duplicates as new local tournaments", () => {
    const source = localRecord();
    const imported = parseTournamentExport(makeTournamentExport(source));
    const duplicate = duplicateLocalTournament(source);

    expect(imported.localId).not.toBe(source.localId);
    expect(imported.snapshot.slug).toBe(imported.localId);
    expect(imported.hostingStatus).toBe("local");
    expect(duplicate.localId).not.toBe(source.localId);
    expect(duplicate.snapshot.name).toBe("Offline Finals (copy)");
    expect("hostedSlug" in duplicate).toBe(false);
  });

  it("exports and duplicates Vue-reactive local records safely", () => {
    const reactiveRecord = reactive(localRecord());
    expect(() => makeTournamentExport(reactiveRecord)).not.toThrow();
    expect(() => duplicateLocalTournament(reactiveRecord)).not.toThrow();
  });

  it("does not expose the retired anonymous creation endpoint", async () => {
    const response = await handleApi(
      new Request("http://local.test/api/tournaments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Anonymous server tournament",
          format: "single",
          participants: ["A", "B"],
          retentionDays: 7,
        }),
      }),
      schemaOnlyEnv(),
    );
    expect(response.status).toBe(404);
  });

  it("requires a signed-in account before accepting a hosted snapshot", async () => {
    const response = await handleApi(
      new Request("http://local.test/api/hosted-tournaments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot: localRecord().snapshot, retentionDays: 365 }),
      }),
      schemaOnlyEnv(),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "ACCOUNT_REQUIRED" });
  });
});
