import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  googleSubject: text("google_subject").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  nonce: text("nonce").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  returnTo: text("return_to").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const tournaments = sqliteTable(
  "tournaments",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    organizerTokenHash: text("organizer_token_hash").notNull(),
    ownerUserId: text("owner_user_id"),
    name: text("name").notNull(),
    format: text("format").notNull(),
    status: text("status").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    revision: integer("revision").notNull().default(1),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("tournaments_owner_idx").on(table.ownerUserId),
    index("tournaments_expiry_idx").on(table.expiresAt),
  ],
);

export const tournamentHistory = sqliteTable(
  "tournament_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tournamentId: text("tournament_id").notNull(),
    revision: integer("revision").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("tournament_history_idx").on(table.tournamentId, table.revision)],
);
