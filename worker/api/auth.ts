import { createRemoteJWKSet, jwtVerify } from "jose";
import { json } from "./http";
import type { ApiEnv } from "./types";

export function randomToken(bytes = 24) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function cookies(request: Request) {
  return Object.fromEntries(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key),
  );
}

export async function currentUser(request: Request, env: ApiEnv) {
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


function safeReturnTo(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function startGoogle(request: Request, env: ApiEnv) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return json(
      {
        error:
          "Google sign-in is not configured yet. Local tournaments remain available without an account.",
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

export async function googleCallback(request: Request, env: ApiEnv) {
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

export async function sessionResponse(request: Request, env: ApiEnv) {
  return json({ user: await currentUser(request, env) });
}

export async function accountTournaments(request: Request, env: ApiEnv) {
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
