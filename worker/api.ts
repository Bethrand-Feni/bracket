import {
  applyResult,
  confirmQualifiers,
  generateNextSwissRound,
  normalizeTournamentSnapshot,
  unlockPreliminaryStage,
  type TournamentSnapshot,
} from "../lib/tournament";
import type { ApiEnv } from "./api/types";
import { json } from "./api/http";
import { ensureSchema } from "./api/bootstrap";
import {
  accountTournaments,
  cookies,
  currentUser,
  googleCallback,
  hash,
  randomToken,
  sessionResponse,
  startGoogle,
} from "./api/auth";
import {
  confirmQualifiersSchema,
  hostedTournamentSchema,
  resultSchema,
  retentionSchema,
  transitionSchema,
} from "./api/schemas";

export type { ApiEnv } from "./api/types";

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
  const user = await currentUser(request, env);
  if (row.owner_user_id) return Boolean(user && row.owner_user_id === user.id);
  const token = organizerToken(request);
  return Boolean(token && (await hash(token)) === row.organizer_token_hash);
}

async function hostTournament(request: Request, env: ApiEnv) {
  const user = await currentUser(request, env);
  if (!user) {
    return json(
      { error: "Sign in with Google before creating a hosted copy.", code: "ACCOUNT_REQUIRED" },
      { status: 401 },
    );
  }
  const parsed = hostedTournamentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json(
      { error: "That local tournament snapshot cannot be hosted.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data.snapshot;
  const limit =
    input.format === "round-robin" ? 16 : input.format === "double" ? 32 : 64;
  if (input.participants.length > limit) {
    return json(
      { error: `${input.format} supports up to ${limit} participants.` },
      { status: 400 },
    );
  }
  const now = Date.now();
  const tournamentId = crypto.randomUUID();
  const slug = randomToken(8).toLowerCase();
  const expiresAt = now + parsed.data.retentionDays * 86_400_000;
  const snapshot = normalizeTournamentSnapshot(structuredClone(input));
  snapshot.id = tournamentId;
  snapshot.slug = slug;
  snapshot.expiresAt = expiresAt;
  await env.DB.prepare(
    `INSERT INTO tournaments (
      id, slug, organizer_token_hash, owner_user_id, name, format, status,
      snapshot_json, revision, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      tournamentId,
      slug,
      "",
      user.id,
      snapshot.name,
      snapshot.format,
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
      publicPath: `/t/${slug}`,
      managePath: `/t/${slug}/manage`,
    },
    { status: 201 },
  );
}

async function getTournament(env: ApiEnv, slug: string) {
  const row = await tournamentRow(env, slug);
  if (!row) return json({ error: "Tournament not found or expired." }, { status: 404 });
  return json({
    tournament: normalizeTournamentSnapshot(
      JSON.parse(row.snapshot_json) as TournamentSnapshot,
    ),
    revision: row.revision,
    legacyAnonymous: !row.owner_user_id,
  });
}

async function saveResult(request: Request, env: ApiEnv, slug: string) {
  const row = await tournamentRow(env, slug);
  if (!row) return json({ error: "Tournament not found or expired." }, { status: 404 });
  if (!(await canManage(request, env, row))) {
    return json({ error: "Only the signed-in owner can change this hosted tournament." }, { status: 403 });
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
    return json({ error: "Only the signed-in owner can change this hosted tournament." }, { status: 403 });
  }
  const history = await env.DB.prepare(
    `SELECT id, snapshot_json FROM tournament_history
     WHERE tournament_id = ? ORDER BY revision DESC LIMIT 1`,
  )
    .bind(row.id)
    .first<{ id: number; snapshot_json: string }>();
  if (!history) return json({ error: "There is no result to undo." }, { status: 400 });
  const snapshot = normalizeTournamentSnapshot(
    JSON.parse(history.snapshot_json) as TournamentSnapshot,
  );
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
    return json({ error: "Only the signed-in owner can change this hosted tournament." }, { status: 403 });
  }
  const parsed = transitionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Invalid Swiss round request." }, { status: 400 });
  }
  if (parsed.data.expectedRevision !== row.revision) {
    return json(
      { error: "This tournament changed in another tab.", revision: row.revision },
      { status: 409 },
    );
  }
  try {
    const snapshot = generateNextSwissRound(
      JSON.parse(row.snapshot_json) as TournamentSnapshot,
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
      { error: error instanceof Error ? error.message : "Could not generate the next round." },
      { status: 400 },
    );
  }
}

async function confirmTournamentQualifiers(
  request: Request,
  env: ApiEnv,
  slug: string,
) {
  const row = await tournamentRow(env, slug);
  if (!row) {
    return json({ error: "Tournament not found or expired." }, { status: 404 });
  }
  if (!(await canManage(request, env, row))) {
    return json(
      { error: "Only the signed-in owner can start the knockout stage." },
      { status: 403 },
    );
  }
  const parsed = confirmQualifiersSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return json({ error: "Invalid qualifier confirmation." }, { status: 400 });
  }
  if (parsed.data.expectedRevision !== row.revision) {
    return json(
      { error: "This tournament changed in another tab.", revision: row.revision },
      { status: 409 },
    );
  }
  try {
    const snapshot = confirmQualifiers(
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
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not confirm the qualifiers.",
      },
      { status: 400 },
    );
  }
}

async function unlockTournamentPreliminary(
  request: Request,
  env: ApiEnv,
  slug: string,
) {
  const row = await tournamentRow(env, slug);
  if (!row) {
    return json({ error: "Tournament not found or expired." }, { status: 404 });
  }
  if (!(await canManage(request, env, row))) {
    return json(
      { error: "Only the signed-in owner can unlock this stage." },
      { status: 403 },
    );
  }
  const parsed = transitionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return json({ error: "Invalid stage unlock request." }, { status: 400 });
  }
  if (parsed.data.expectedRevision !== row.revision) {
    return json(
      { error: "This tournament changed in another tab.", revision: row.revision },
      { status: 409 },
    );
  }
  try {
    const snapshot = unlockPreliminaryStage(
      JSON.parse(row.snapshot_json) as TournamentSnapshot,
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
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not unlock the preliminary stage.",
      },
      { status: 400 },
    );
  }
}

async function updateRetention(request: Request, env: ApiEnv, slug: string) {
  const row = await tournamentRow(env, slug);
  if (!row) return json({ error: "Tournament not found or expired." }, { status: 404 });
  if (!(await canManage(request, env, row))) {
    return json({ error: "Only the signed-in owner can change this hosted tournament." }, { status: 403 });
  }
  const parsed = retentionSchema.safeParse(await request.json());
  if (!parsed.success) return json({ error: "Invalid retention choice." }, { status: 400 });
  if (parsed.data.expectedRevision !== row.revision) {
    return json({ error: "This tournament changed in another tab." }, { status: 409 });
  }
  if (!row.owner_user_id) {
    return json(
      {
        error: "Legacy anonymous tournaments cannot be extended. Sign in and claim it first.",
        code: "LEGACY_CLAIM_REQUIRED",
      },
      { status: 403 },
    );
  }
  const snapshot = normalizeTournamentSnapshot(
    JSON.parse(row.snapshot_json) as TournamentSnapshot,
  );
  snapshot.expiresAt = Date.now() + parsed.data.retentionDays * 86_400_000;
  snapshot.revision += 1;
  await env.DB.prepare(
    `UPDATE tournaments SET expires_at = ?,
      snapshot_json = ?, revision = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(
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
    return json({ error: "Only the owner can delete this tournament." }, { status: 403 });
  }
  await env.DB.prepare("DELETE FROM tournaments WHERE slug = ?").bind(slug).run();
  return new Response(null, { status: 204 });
}

async function claimLegacyTournament(request: Request, env: ApiEnv, slug: string) {
  const row = await tournamentRow(env, slug);
  if (!row) return json({ error: "Tournament not found or expired." }, { status: 404 });
  if (row.owner_user_id) return json({ error: "This tournament already has an owner." }, { status: 409 });
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Sign in before claiming this tournament." }, { status: 401 });
  const token = organizerToken(request);
  if (!token || (await hash(token)) !== row.organizer_token_hash) {
    return json({ error: "The original organizer link is required to claim this tournament." }, { status: 403 });
  }
  await env.DB.prepare(
    "UPDATE tournaments SET owner_user_id = ?, updated_at = ? WHERE id = ? AND owner_user_id IS NULL",
  )
    .bind(user.id, Date.now(), row.id)
    .run();
  return json({ ok: true, managePath: `/t/${slug}/manage` });
}

export async function handleApi(request: Request, env: ApiEnv) {
  await ensureSchema(env.DB);
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/hosted-tournaments" && request.method === "POST") {
    return hostTournament(request, env);
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
    /^\/api\/tournaments\/([^/]+)(?:\/(version|matches|undo|swiss-rounds|retention|claim|qualifiers\/confirm|preliminary\/unlock))?$/,
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
    if (action === "qualifiers/confirm" && request.method === "POST") {
      return confirmTournamentQualifiers(request, env, slug);
    }
    if (action === "preliminary/unlock" && request.method === "POST") {
      return unlockTournamentPreliminary(request, env, slug);
    }
    if (action === "retention" && request.method === "PATCH") {
      return updateRetention(request, env, slug);
    }
    if (action === "claim" && request.method === "POST") {
      return claimLegacyTournament(request, env, slug);
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
