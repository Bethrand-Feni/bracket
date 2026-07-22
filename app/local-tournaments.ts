import {
  normalizeTournamentSnapshot,
  type TournamentSnapshot,
} from "../lib/tournament";

export type HostingStatus = "local" | "uploading" | "hosted" | "sync-error";

export type PendingHostedMutation =
  | {
      kind: "result";
      matchId: string;
      scoreA: number;
      scoreB: number;
      winnerId: string | null;
      expectedRevision: number;
    }
  | {
      kind: "swiss-round";
      expectedRevision: number;
    }
  | {
      kind: "confirm-qualifiers";
      participantIds: string[];
      acknowledgeTies: boolean;
      expectedRevision: number;
    }
  | {
      kind: "unlock-preliminary";
      expectedRevision: number;
    };

export interface LocalTournamentRecord {
  localId: string;
  snapshot: TournamentSnapshot;
  hostingStatus: HostingStatus;
  hostedSlug?: string;
  hostedRevision?: number;
  createdAt: number;
  updatedAt: number;
  history?: TournamentSnapshot[];
  pendingMutation?: PendingHostedMutation;
}

export interface TournamentExport {
  kind: "bracket-local-tournament";
  version: 1 | 2;
  exportedAt: number;
  tournament: LocalTournamentRecord;
}

const DATABASE_NAME = "bracket-local";
const STORE_NAME = "tournaments";
const CHANNEL_NAME = "bracket-local-tournaments";
export const MAX_LOCAL_TOURNAMENTS = 3;

let databasePromise: Promise<IDBDatabase> | null = null;

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser storage failed."));
  });
}

function database() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "localId" });
          store.createIndex("hostedSlug", "hostedSlug", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open browser storage."));
    });
  }
  return databasePromise;
}

async function store(mode: IDBTransactionMode) {
  const db = await database();
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

export function createLocalId() {
  return crypto.randomUUID();
}

export async function getLocalTournament(localId: string) {
  return requestResult<LocalTournamentRecord | undefined>(
    (await store("readonly")).get(localId),
  );
}

export async function findLocalTournamentByHostedSlug(hostedSlug: string) {
  const index = (await store("readonly")).index("hostedSlug");
  return requestResult<LocalTournamentRecord | undefined>(index.get(hostedSlug));
}

export async function listLocalTournaments() {
  const records = await requestResult<LocalTournamentRecord[]>(
    (await store("readonly")).getAll(),
  );
  return records.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putLocalTournament(record: LocalTournamentRecord) {
  const copy = plainClone(record);
  copy.updatedAt = Date.now();
  const db = await database();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const tournamentStore = transaction.objectStore(STORE_NAME);
  const existing = await requestResult(tournamentStore.get(copy.localId));
  if (!existing) {
    const tournamentCount = await requestResult(tournamentStore.count());
    if (tournamentCount >= MAX_LOCAL_TOURNAMENTS) {
      transaction.abort();
      throw new Error(
        `This browser can store up to ${MAX_LOCAL_TOURNAMENTS} tournaments. Export or delete one before adding another.`,
      );
    }
  }
  await requestResult(tournamentStore.put(copy));
  announceLocalChange(copy.localId);
  return copy;
}

export async function deleteLocalTournament(localId: string) {
  await requestResult((await store("readwrite")).delete(localId));
  announceLocalChange(localId, "deleted");
}

export function duplicateLocalTournament(record: LocalTournamentRecord) {
  const now = Date.now();
  const localId = createLocalId();
  const snapshot = normalizeTournamentSnapshot(plainClone(record.snapshot));
  snapshot.id = localId;
  snapshot.slug = localId;
  snapshot.name = `${snapshot.name} (copy)`;
  snapshot.createdAt = now;
  snapshot.expiresAt = 0;
  return {
    localId,
    snapshot,
    hostingStatus: "local" as const,
    createdAt: now,
    updatedAt: now,
    history: [],
  };
}

export function makeTournamentExport(record: LocalTournamentRecord): TournamentExport {
  const copy = plainClone(record);
  copy.snapshot = normalizeTournamentSnapshot(copy.snapshot);
  copy.hostingStatus = "local";
  delete copy.hostedSlug;
  delete copy.hostedRevision;
  delete copy.pendingMutation;
  return {
    kind: "bracket-local-tournament",
    version: 2,
    exportedAt: Date.now(),
    tournament: copy,
  };
}

function validSnapshot(value: unknown): value is TournamentSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<TournamentSnapshot>;
  return (
    typeof snapshot.name === "string" &&
    ["single", "double", "round-robin", "swiss", "groups"].includes(
      String(snapshot.format),
    ) &&
    Array.isArray(snapshot.participants) &&
    snapshot.participants.length >= 2 &&
    Array.isArray(snapshot.matches) &&
    typeof snapshot.revision === "number"
  );
}

export function parseTournamentExport(value: unknown): LocalTournamentRecord {
  if (!value || typeof value !== "object") throw new Error("That file is not a tournament export.");
  const exported = value as Partial<TournamentExport>;
  if (
    exported.kind !== "bracket-local-tournament" ||
    (exported.version !== 1 && exported.version !== 2) ||
    !exported.tournament ||
    !validSnapshot(exported.tournament.snapshot)
  ) {
    throw new Error("That file is not a supported Bracket tournament export.");
  }
  const now = Date.now();
  const localId = createLocalId();
  const record = plainClone(exported.tournament);
  record.localId = localId;
  record.snapshot = normalizeTournamentSnapshot(record.snapshot);
  record.snapshot.id = localId;
  record.snapshot.slug = localId;
  record.snapshot.expiresAt = 0;
  record.hostingStatus = "local";
  record.createdAt = now;
  record.updatedAt = now;
  record.history = Array.isArray(record.history) ? record.history : [];
  delete record.hostedSlug;
  delete record.hostedRevision;
  delete record.pendingMutation;
  return record;
}

function announceLocalChange(localId: string, type: "updated" | "deleted" = "updated") {
  if (!("BroadcastChannel" in window)) return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ localId, type });
  channel.close();
}

export function subscribeToLocalChanges(
  listener: (event: { localId: string; type: "updated" | "deleted" }) => void,
) {
  if (!("BroadcastChannel" in window)) return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => listener(event.data);
  return () => channel.close();
}
