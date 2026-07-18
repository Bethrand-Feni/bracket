import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import {
  applyResult,
  createTournamentSnapshot,
  generateNextSwissRound,
  type TournamentSnapshot,
} from "../lib/tournament";

export interface ApiEnv {
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APP_ORIGIN?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  format: z.enum(["single", "double", "round-robin", "swiss"]),
  participants: z.array(z.string().trim().min(1).max(80)).min(2).max(64),
  retentionDays: z.union([
    z.literal(1),
    z.literal(7),
    z.literal(14),
    z.literal(30),
    z.literal(365),
  ]),
});

const resultSchema = z.object({
  matchId: z.string().min(1),
  scoreA: z.number().int().min(0).max(999),
  scoreB: z.number().int().min(0).max(999),
  winnerId: z.string().nullable().optional(),
  expectedRevision: z.number().int().positive(),
});

const retentionSchema = z.object({
  retentionDays: z.union([
    z.literal(1),
    z.literal(7),
    z.literal(14),
    z.literal(30),
    z.literal(365),
  ]),
  expectedRevision: z.number().int().positive(),
});

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_subject TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    return_to TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    organizer_token_hash TEXT NOT NULL,
    owner_user_id TEXT,
    name TEXT NOT NULL,
    format TEXT NOT NULL,
    status TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS tournaments_owner_idx ON tournaments(owner_user_id)`,
  `CREATE INDEX IF NOT EXISTS tournaments_expiry_idx ON tournaments(expires_at)`,
  `CREATE TABLE IF NOT EXISTS tournament_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS tournament_history_idx ON tournament_history(tournament_id, revision)`,
];

let schemaReady = false;

async function ensureSchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  schemaReady = true;
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function randomToken(bytes = 24) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function cookies(request: Request) {
  return Object.fromEntries(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key),
  );
}

async function currentUser(request: Request, env: ApiEnv) {
  const sessionToken = cookies(request).bracket_session;
  if (!sessionToken) return null;
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT users.id, users.email, users.name, users.avatar_url
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
  )
    .bind(await hash(sessionToken), now)
    .first<{ id: string; email: string; name: string | null; avatar_url: string | null }>();
  return row;
}

function organizerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

async function tournamentRow(env: ApiEnv, slug: string) {
  return env.DB.prepare(
    `SELECT id, slug, organizer_token_hash, owner_user_id, name, format, status,
      snapshot_json, revision, expires_at, created_at, updated_at
     FROM tournaments WHERE slug = ? AND expires_at > ?`,
  )
    .bind(slug, Date.now())
    .first<{
      id: string;
      slug: string;
      organizer_token_hash: string;
      owner_user_id: string | null;
      name: string;
      format: string;
      status: string;
      snapshot_json: string;
      revision: number;
      expires_at: number;
      created_at: number;
      updated_at: number;
    }>();
}

async function canManage(request: Request, env: ApiEnv, row: Awaited<ReturnType<typeof tournamentRow>>) {
  if (!row) return false;
  const token = organizerToken(request);
  if (token && (await hash(token)) === row.organizer_token_hash) return true;
  const user = await currentUser(request, env);
  return Boolean(user && row.owner_user_id === user.id);
}

async function createTournament(request: Request, env: ApiEnv) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json(
      { error: "Please check the tournament details.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const limit =
    input.format === "round-robin" ? 16 : input.format === "double" ? 32 : 64;
  if (input.participants.length > limit) {
    return json(
      { error: `${input.format} supports up to ${limit} participants.` },
      { status: 400 },
    );
  }
  const user = await currentUser(request, env);
  if (input.retentionDays >= 30 && !user) {
    return json(
      {
        error: "Google sign-in is required for one-month and one-year tournaments.",
        code: "ACCOUNT_REQUIRED",
      },
      { status: 401 },
    );
  }

  const now = Date.now();
  const tournamentId = crypto.randomUUID();
  const slug = randomToken(8).toLowerCase();
  const rawOrganizerToken = randomToken(32);
  const expiresAt = now + input.retentionDays * 86_400_000;
  const snapshot = createTournamentSnapshot({
    id: tournamentId,
    slug,
    name: input.name,
    format: input.format,
    participantNames: input.participants,
    expiresAt,
    createdAt: now,
  });
  await env.DB.prepare(
    `INSERT INTO tournaments (
      id, slug, organizer_token_hash, owner_user_id, name, format, status,
      snapshot_json, revision, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      tournamentId,
      slug,
      await hash(rawOrganizerToken),
      user?.id ?? null,
      input.name,
      input.format,
      snapshot.status,
      JSON.stringify(snapshot),
      snapshot.revision,
      expiresAt,
      now,
      now,
    )
    .run();

  return json(
    {
      tournament: snapshot,
      organizerToken: rawOrganizerToken,
      publicPath: `/t/${slug}`,
      organizerPath: `/t/${slug}/manage#key=${rawOrganizerToken}`,
    },
    { status: 201 },
  );
}

async function getTournament(env: ApiEnv, slug: string) {
  const row = await tournamentRow(env, slug);
  if (!row) return json({ error: "Tournament not found or expired." }, { status: 404 });
  return json({
    tournament: JSON.parse(row.snapshot_json) as TournamentSnapshot,
    revision: row.revision,
  });
}

async function saveResult(request: Request, env: ApiEnv, slug: string) {
  const row = await tournamentRow(env, slug);
  if (!row) return json({ error: "Tournament not found or expired." }, { status: 404 });
  if (!(await canManage(request, env, row))) {
    return json({ error: "The organizer link is required." }, { status: 403 });
  }
  const parsed = resultSchema.safeParse(await request.json());
  if (!parsed.success) return json({ error: "Invalid match result." }, { status: 400 });
  if (parsed.data.expectedRevision !== row.revision) {
    return json(
      { error: "This tournament changed in another tab.", revision: row.revision },
      { status: 409 },
    );
  }
  try {
    const snapshot = applyResult(
      JSON.parse(row.snapshot_json) as TournamentSnapshot,
      parsed.data,
    );
    const now = Date.now();
    const [historyResult, updateResult] = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO tournament_history (tournament_id, revision, snapshot_json, created_at) VALUES (?, ?, ?, ?)",
      ).bind(row.id, row.revision, row.snapshot_json, now),
      env.DB.prepare(
        `UPDATE tournaments
         SET snapshot_json = ?, status = ?, revision = ?, updated_at = ?
         WHERE slug = ? AND revision = ?`,
      ).bind(
        JSON.stringify(snapshot),
        snapshot.status,
        snapshot.revision,
        now,
        slug,
        row.revision,
      ),
    ]);
    if (!historyResult.success || !updateResult.meta.changes) {
      return json({ error: "This tournament changed in another tab." }, { status: 409 });
    }
    return json({ tournament: snapshot });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Could not save the result." },
      { status: 400 },
    );
  }
}

async function undoResult(request: Request, env: ApiEnv, slug: string) {
  const row = await tournamentRow(env, slug);
  if (!row) return json({ error: "Tournament not found or expired." }, { status: 404 });
  if (!(await canManage(request, env, row))) {
    return json({ error: "The organizer link is required." }, { status: 403 });
  }
  const history = await env.DB.prepare(
    `SELECT id, snapshot_json FROM tournament_history
     WHERE tournament_id = ? ORDER BY revision DESC LIMIT 1`,
  )
    .bind(row.id)
    .first<{ id: number; snapshot_json: string }>();
  if (!history) return json({ error: "There is no result to undo." }, { status: 400 });
  const snapshot = JSON.parse(history.snapshot_json) as TournamentSnapshot;
  snapshot.revision = row.revision + 1;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE tournaments SET snapshot_json = ?, status = ?, revision = ?, updated_at = ? WHERE id = ?",
    ).bind(JSON.stringify(snapshot), snapshot.status, snapshot.revision, now, row.id),
    env.DB.prepare("DELETE FROM tournament_history WHERE id = ?").bind(history.id),
  ]);
  return json({ tournament: snapshot });
}

async function nextSwissRound(request: Request, env: ApiEnv, slug: string) {
  const row = await tournamentRow(env, slug);
  if (!row) return json({ error: "Tournament not found or expired." }, { status: 404 });
  if (!(await canManage(request, env, row))) {
    return json({ error: "The organizer link is required." }, { status: 403 });
  }
  try {
    const snapshot = generateNextSwissRound(
      JSON.parse(row.snapshot_json) as TournamentSnapshot,
    );
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO tournament_history (tournament_id, revision, snapshot_json, created_at) VALUES (?, ?, ?, ?)",
      ).bind(row.id, row.revision, row.snapshot_json, now),
      env.DB.prepare(
        "UPDATE tournaments SET snapshot_json = ?, status = ?, revision = ?, updated_at = ? WHERE id = ?",
      ).bind(JSON.stringify(snapshot), snapshot.status, snapshot.revision, now, row.id),
    ]);
    return json({ tournament: snapshot });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Could not generate the next round." },
      { status: 400 },
    );
  }
}

async function updateRetention(request: Request, env: ApiEnv, slug: string) {
  const row = await tournamentRow(env, slug);
  if (!row) return json({ error: "Tournament not found or expired." }, { status: 404 });
  if (!(await canManage(request, env, row))) {
    return json({ error: "The organizer link is required." }, { status: 403 });
  }
  const parsed = retentionSchema.safeParse(await request.json());
  if (!parsed.success) return json({ error: "Invalid retention choice." }, { status: 400 });
  if (parsed.data.expectedRevision !== row.revision) {
    return json({ error: "This tournament changed in another tab." }, { status: 409 });
  }
  const user = await currentUser(request, env);
  if (parsed.data.retentionDays >= 30 && !user) {
    return json(
      { error: "Google sign-in is required for long-term retention.", code: "ACCOUNT_REQUIRED" },
      { status: 401 },
    );
  }
  const snapshot = JSON.parse(row.snapshot_json) as TournamentSnapshot;
  snapshot.expiresAt = Date.now() + parsed.data.retentionDays * 86_400_000;
  snapshot.revision += 1;
  await env.DB.prepare(
    `UPDATE tournaments SET owner_user_id = COALESCE(?, owner_user_id), expires_at = ?,
      snapshot_json = ?, revision = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(
      user?.id ?? null,
      snapshot.expiresAt,
      JSON.stringify(snapshot),
      snapshot.revision,
      Date.now(),
      row.id,
    )
    .run();
  return json({ tournament: snapshot });
}

async function deleteTournament(request: Request, env: ApiEnv, slug: string) {
  const row = await tournamentRow(env, slug);
  if (!row) return json({ error: "Tournament not found or expired." }, { status: 404 });
  if (!(await canManage(request, env, row))) {
    return json({ error: "The organizer link is required." }, { status: 403 });
  }
  await env.DB.prepare("DELETE FROM tournaments WHERE slug = ?").bind(slug).run();
  return new Response(null, { status: 204 });
}

function safeReturnTo(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function startGoogle(request: Request, env: ApiEnv) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return json(
      {
        error:
          "Google sign-in is not configured yet. Short-lived tournaments remain available without an account.",
      },
      { status: 503 },
    );
  }
  const url = new URL(request.url);
  const state = randomToken(24);
  const nonce = randomToken(24);
  const codeVerifier = randomToken(48);
  const challengeBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  const codeChallenge = btoa(
    String.fromCharCode(...new Uint8Array(challengeBytes)),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  await env.DB.prepare(
    "INSERT INTO oauth_states (state, nonce, code_verifier, return_to, expires_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(state, nonce, codeVerifier, returnTo, Date.now() + 600_000)
    .run();
  const origin = env.APP_ORIGIN || url.origin;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  auth.searchParams.set("redirect_uri", `${origin}/api/auth/google/callback`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", state);
  auth.searchParams.set("nonce", nonce);
  auth.searchParams.set("code_challenge", codeChallenge);
  auth.searchParams.set("code_challenge_method", "S256");
  return new Response(null, {
    status: 302,
    headers: {
      location: auth.toString(),
      "set-cookie": `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

async function googleCallback(request: Request, env: ApiEnv) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return json({ error: "Google sign-in is not configured." }, { status: 503 });
  }
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code || cookies(request).oauth_state !== state) {
    return json({ error: "Invalid sign-in response." }, { status: 400 });
  }
  const saved = await env.DB.prepare(
    "SELECT nonce, code_verifier, return_to, expires_at FROM oauth_states WHERE state = ?",
  )
    .bind(state)
    .first<{
      nonce: string;
      code_verifier: string;
      return_to: string;
      expires_at: number;
    }>();
  await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  if (!saved || saved.expires_at < Date.now()) {
    return json({ error: "The sign-in request expired." }, { status: 400 });
  }
  const origin = env.APP_ORIGIN || url.origin;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: saved.code_verifier,
    }),
  });
  if (!tokenResponse.ok) return json({ error: "Google sign-in failed." }, { status: 401 });
  const tokens = (await tokenResponse.json()) as { id_token: string };
  const { payload } = await jwtVerify(
    tokens.id_token,
    createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")),
    {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.GOOGLE_CLIENT_ID,
    },
  );
  if (payload.nonce !== saved.nonce || !payload.sub || !payload.email) {
    return json({ error: "Google identity could not be verified." }, { status: 401 });
  }
  const now = Date.now();
  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE google_subject = ?",
  )
    .bind(payload.sub)
    .first<{ id: string }>();
  const userId = existing?.id ?? crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, google_subject, email, name, avatar_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(google_subject) DO UPDATE SET
       email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url,
       updated_at = excluded.updated_at`,
  )
    .bind(
      userId,
      payload.sub,
      payload.email,
      typeof payload.name === "string" ? payload.name : null,
      typeof payload.picture === "string" ? payload.picture : null,
      now,
      now,
    )
    .run();
  const sessionToken = randomToken(32);
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(await hash(sessionToken), userId, now + 30 * 86_400_000, now)
    .run();
  return new Response(null, {
    status: 302,
    headers: {
      location: new URL(saved.return_to, origin).toString(),
      "set-cookie": `bracket_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    },
  });
}

async function sessionResponse(request: Request, env: ApiEnv) {
  return json({ user: await currentUser(request, env) });
}

async function accountTournaments(request: Request, env: ApiEnv) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in required." }, { status: 401 });
  const result = await env.DB.prepare(
    `SELECT slug, name, format, status, revision, expires_at, created_at
     FROM tournaments WHERE owner_user_id = ? AND expires_at > ?
     ORDER BY updated_at DESC`,
  )
    .bind(user.id, Date.now())
    .all();
  return json({ tournaments: result.results });
}

export async function handleApi(request: Request, env: ApiEnv) {
  await ensureSchema(env.DB);
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/tournaments" && request.method === "POST") {
    return createTournament(request, env);
  }
  if (path === "/api/auth/google/start" && request.method === "GET") {
    return startGoogle(request, env);
  }
  if (path === "/api/auth/google/callback" && request.method === "GET") {
    return googleCallback(request, env);
  }
  if (path === "/api/auth/session" && request.method === "GET") {
    return sessionResponse(request, env);
  }
  if (path === "/api/auth/logout" && request.method === "POST") {
    const sessionToken = cookies(request).bracket_session;
    if (sessionToken) {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
        .bind(await hash(sessionToken))
        .run();
    }
    return json(
      { ok: true },
      {
        headers: {
          "set-cookie":
            "bracket_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
        },
      },
    );
  }
  if (path === "/api/account/tournaments" && request.method === "GET") {
    return accountTournaments(request, env);
  }

  const match = path.match(
    /^\/api\/tournaments\/([^/]+)(?:\/(version|matches|undo|swiss-rounds|retention))?$/,
  );
  if (match) {
    const slug = match[1];
    const action = match[2];
    if (!action && request.method === "GET") return getTournament(env, slug);
    if (!action && request.method === "DELETE") return deleteTournament(request, env, slug);
    if (action === "version" && request.method === "GET") {
      const row = await tournamentRow(env, slug);
      return row
        ? json({ revision: row.revision, status: row.status, expiresAt: row.expires_at })
        : json({ error: "Tournament not found or expired." }, { status: 404 });
    }
    if (action === "matches" && request.method === "PATCH") {
      return saveResult(request, env, slug);
    }
    if (action === "undo" && request.method === "POST") {
      return undoResult(request, env, slug);
    }
    if (action === "swiss-rounds" && request.method === "POST") {
      return nextSwissRound(request, env, slug);
    }
    if (action === "retention" && request.method === "PATCH") {
      return updateRetention(request, env, slug);
    }
  }
  return json({ error: "Not found." }, { status: 404 });
}

export async function handleScheduled(env: ApiEnv) {
  await ensureSchema(env.DB);
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .bind(Date.now())
    .run();
  await env.DB.prepare("DELETE FROM oauth_states WHERE expires_at <= ?")
    .bind(Date.now())
    .run();
  await env.DB.prepare("DELETE FROM tournaments WHERE expires_at <= ?")
    .bind(Date.now())
    .run();
}
