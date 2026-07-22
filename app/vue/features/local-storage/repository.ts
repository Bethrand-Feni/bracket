import {
  deleteLocalTournament,
  findLocalTournamentByHostedSlug,
  getLocalTournament,
  listLocalTournaments,
  putLocalTournament,
  subscribeToLocalChanges,
  type LocalTournamentRecord,
} from "../../../local-tournaments";

export interface LocalTournamentRepository {
  get(localId: string): Promise<LocalTournamentRecord | undefined>;
  findByHostedSlug(hostedSlug: string): Promise<LocalTournamentRecord | undefined>;
  list(): Promise<LocalTournamentRecord[]>;
  put(record: LocalTournamentRecord): Promise<LocalTournamentRecord>;
  delete(localId: string): Promise<void>;
  subscribe(listener: (event: { localId: string; type: "updated" | "deleted" }) => void): () => void;
}

export const indexedDbTournamentRepository: LocalTournamentRepository = {
  get: getLocalTournament,
  findByHostedSlug: findLocalTournamentByHostedSlug,
  list: listLocalTournaments,
  put: putLocalTournament,
  delete: deleteLocalTournament,
  subscribe: subscribeToLocalChanges,
};
