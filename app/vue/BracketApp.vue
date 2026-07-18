<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  formatLabels,
  participantName,
  type Match,
  type TournamentFormat,
  type TournamentSnapshot,
} from "../../lib/tournament";

type User = { id: string; email: string; name: string | null; avatar_url: string | null };

const path = ref("/");
const loading = ref(false);
const error = ref("");
const notice = ref("");
const tournament = ref<TournamentSnapshot | null>(null);
const remoteRevision = ref<number | null>(null);
const user = ref<User | null>(null);
const accountTournaments = ref<Array<Record<string, string | number>>>([]);
const wheelEntries = ref<string[]>([]);
const wheelText = ref("");
const wheelHistory = ref<string[]>([]);
const wheelRotation = ref(0);
const wheelSpinning = ref(false);
const wheelWinner = ref("");
const scoreDrafts = ref<Record<string, { a: number; b: number }>>({});
const retentionChoice = ref(7);

const createForm = ref({
  name: "Saturday Game Night",
  format: "single" as TournamentFormat,
  participants: "Ava\nNoah\nMia\nLeo\nZoe\nKai\nIvy\nMax",
  retentionDays: 7,
  shuffle: false,
});

const formats: Array<{ value: TournamentFormat; label: string; description: string }> = [
  { value: "single", label: "Single elimination", description: "One loss and you're out." },
  { value: "double", label: "Double elimination", description: "A second chance in the lower bracket." },
  { value: "round-robin", label: "Round robin", description: "Everyone meets everyone." },
  { value: "swiss", label: "Swiss", description: "Pair players with similar records." },
];

const expiryOptions = [
  { days: 1, label: "1 day", account: false },
  { days: 7, label: "7 days", account: false },
  { days: 14, label: "2 weeks", account: false },
  { days: 30, label: "1 month", account: true },
  { days: 365, label: "1 year", account: true },
];

const route = computed(() => {
  if (path.value === "/create") return "create";
  if (path.value === "/account/tournaments") return "account";
  if (/^\/t\/[^/]+\/wheel$/.test(path.value)) return "wheel";
  if (/^\/t\/[^/]+\/manage$/.test(path.value)) return "manage";
  if (/^\/t\/[^/]+$/.test(path.value)) return "public";
  return "home";
});

const slug = computed(() => path.value.match(/^\/t\/([^/]+)/)?.[1] ?? "");
const organizerToken = computed(() => {
  if (!slug.value) return "";
  const fragment = new URLSearchParams(window.location.hash.slice(1)).get("key");
  if (fragment) {
    localStorage.setItem(`bracket-organizer-${slug.value}`, fragment);
    return fragment;
  }
  return localStorage.getItem(`bracket-organizer-${slug.value}`) ?? "";
});
const isManager = computed(() => route.value === "manage");
const groupedMatches = computed(() => {
  if (!tournament.value) return [];
  const labels = [...new Set(tournament.value.matches.map((match) => match.roundLabel))];
  return labels.map((label) => ({
    label,
    matches: tournament.value!.matches.filter((match) => match.roundLabel === label),
  }));
});
const winner = computed(() => {
  if (!tournament.value || tournament.value.status !== "complete") return "";
  const final = [...tournament.value.matches].reverse().find((match) => match.winnerId);
  return final ? participantName(tournament.value, final.winnerId) : "";
});
const wheelGradient = computed(() => {
  const colors = ["#0725b0", "#6b4a3a", "#e5ded4", "#f2efea"];
  const count = Math.max(1, wheelEntries.value.length);
  return `conic-gradient(${wheelEntries.value
    .map((_, index) => {
      const start = (index / count) * 360;
      const end = ((index + 1) / count) * 360;
      return `${colors[index % colors.length]} ${start}deg ${end}deg`;
    })
    .join(",")})`;
});

let versionTimer: number | undefined;

function navigate(nextPath: string) {
  history.pushState({}, "", nextPath);
  path.value = window.location.pathname;
  error.value = "";
  notice.value = "";
  void loadRoute();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goBack() {
  history.back();
}

async function api<T>(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (organizerToken.value) headers.set("authorization", `Bearer ${organizerToken.value}`);
  const response = await fetch(url, { ...options, headers });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const err = new Error(data?.error ?? "Something went wrong.") as Error & {
      status?: number;
      code?: string;
    };
    err.status = response.status;
    err.code = data?.code;
    throw err;
  }
  return data as T;
}

async function loadSession() {
  try {
    const data = await api<{ user: User | null }>("/api/auth/session");
    user.value = data.user;
  } catch {
    user.value = null;
  }
}

async function loadTournament() {
  if (!slug.value) return;
  loading.value = true;
  try {
    const data = await api<{ tournament: TournamentSnapshot; revision: number }>(
      `/api/tournaments/${slug.value}`,
    );
    tournament.value = data.tournament;
    remoteRevision.value = null;
    if (route.value === "wheel") loadWheelState();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Tournament unavailable.";
    tournament.value = null;
  } finally {
    loading.value = false;
  }
}

async function checkVersion() {
  if (!tournament.value || document.hidden) return;
  try {
    const data = await api<{ revision: number }>(
      `/api/tournaments/${tournament.value.slug}/version`,
    );
    if (data.revision > tournament.value.revision) remoteRevision.value = data.revision;
  } catch {
    // The full refresh surface will explain expired/deleted tournaments.
  }
}

async function loadAccount() {
  loading.value = true;
  try {
    const data = await api<{ tournaments: Array<Record<string, string | number>> }>(
      "/api/account/tournaments",
    );
    accountTournaments.value = data.tournaments;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Sign in to see saved tournaments.";
  } finally {
    loading.value = false;
  }
}

async function loadRoute() {
  window.clearInterval(versionTimer);
  if (["public", "manage", "wheel"].includes(route.value)) {
    await loadTournament();
    versionTimer = window.setInterval(checkVersion, 15_000);
  } else if (route.value === "account") {
    await loadAccount();
  }
}

async function createTournament() {
  error.value = "";
  const participants = createForm.value.participants
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
  if (createForm.value.shuffle) {
    for (let i = participants.length - 1; i > 0; i -= 1) {
      const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
      const j = Math.floor(random * (i + 1));
      [participants[i], participants[j]] = [participants[j], participants[i]];
    }
  }
  loading.value = true;
  try {
    const data = await api<{
      tournament: TournamentSnapshot;
      organizerToken: string;
      organizerPath: string;
    }>("/api/tournaments", {
      method: "POST",
      body: JSON.stringify({
        name: createForm.value.name,
        format: createForm.value.format,
        participants,
        retentionDays: createForm.value.retentionDays,
      }),
    });
    localStorage.setItem(
      `bracket-organizer-${data.tournament.slug}`,
      data.organizerToken,
    );
    navigate(data.organizerPath);
  } catch (err) {
    const typed = err as Error & { code?: string };
    if (typed.code === "ACCOUNT_REQUIRED") {
      sessionStorage.setItem("bracket-create-draft", JSON.stringify(createForm.value));
      window.location.href = `/api/auth/google/start?returnTo=${encodeURIComponent("/create?resume=1")}`;
      return;
    }
    error.value = typed.message;
  } finally {
    loading.value = false;
  }
}

async function recordResult(
  match: Match,
  winnerId: string | null,
  draw = false,
  scores?: { a: number; b: number },
) {
  if (!tournament.value) return;
  loading.value = true;
  error.value = "";
  const aWins = winnerId === match.participantAId;
  try {
    const data = await api<{ tournament: TournamentSnapshot }>(
      `/api/tournaments/${tournament.value.slug}/matches`,
      {
        method: "PATCH",
        body: JSON.stringify({
          matchId: match.id,
          scoreA: scores?.a ?? (draw ? 1 : aWins ? 1 : 0),
          scoreB: scores?.b ?? (draw ? 1 : aWins ? 0 : 1),
          winnerId,
          expectedRevision: tournament.value.revision,
        }),
      },
    );
    tournament.value = data.tournament;
    notice.value = "Result saved.";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not save the result.";
  } finally {
    loading.value = false;
  }
}

function draftFor(match: Match) {
  scoreDrafts.value[match.id] ??= {
    a: match.scoreA ?? 0,
    b: match.scoreB ?? 0,
  };
  return scoreDrafts.value[match.id];
}

async function saveScore(match: Match) {
  const draft = draftFor(match);
  const winnerId =
    draft.a === draft.b
      ? null
      : draft.a > draft.b
        ? match.participantAId
        : match.participantBId;
  await recordResult(match, winnerId, draft.a === draft.b, draft);
}

async function undoResult() {
  if (!tournament.value) return;
  try {
    const data = await api<{ tournament: TournamentSnapshot }>(
      `/api/tournaments/${tournament.value.slug}/undo`,
      { method: "POST" },
    );
    tournament.value = data.tournament;
    notice.value = "Latest result undone.";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not undo the result.";
  }
}

async function generateSwissRound() {
  if (!tournament.value) return;
  try {
    const data = await api<{ tournament: TournamentSnapshot }>(
      `/api/tournaments/${tournament.value.slug}/swiss-rounds`,
      { method: "POST" },
    );
    tournament.value = data.tournament;
    notice.value = "Next Swiss round generated.";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not generate the next round.";
  }
}

async function updateRetention() {
  if (!tournament.value) return;
  try {
    const data = await api<{ tournament: TournamentSnapshot }>(
      `/api/tournaments/${tournament.value.slug}/retention`,
      {
        method: "PATCH",
        body: JSON.stringify({
          retentionDays: retentionChoice.value,
          expectedRevision: tournament.value.revision,
        }),
      },
    );
    tournament.value = data.tournament;
    notice.value = "Retention updated.";
  } catch (err) {
    const typed = err as Error & { code?: string };
    if (typed.code === "ACCOUNT_REQUIRED") {
      signIn(`/t/${tournament.value.slug}/manage`);
      return;
    }
    error.value = typed.message;
  }
}

async function deleteTournament() {
  if (!tournament.value || !window.confirm("Permanently delete this tournament?")) return;
  try {
    await api(`/api/tournaments/${tournament.value.slug}`, { method: "DELETE" });
    navigate("/");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not delete tournament.";
  }
}

async function copyText(value: string, message: string) {
  await navigator.clipboard.writeText(value);
  notice.value = message;
}

function publicUrl() {
  return `${window.location.origin}/t/${slug.value}`;
}

function organizerUrl() {
  return window.location.href;
}

function loadWheelState() {
  if (!tournament.value) return;
  const saved = sessionStorage.getItem(`bracket-wheel-${tournament.value.slug}`);
  if (saved) {
    const parsed = JSON.parse(saved) as { entries: string[]; history: string[] };
    wheelEntries.value = parsed.entries;
    wheelHistory.value = parsed.history;
  } else {
    wheelEntries.value = [];
    wheelHistory.value = [];
  }
  wheelText.value = wheelEntries.value.join("\n");
}

function persistWheel() {
  if (!tournament.value) return;
  sessionStorage.setItem(
    `bracket-wheel-${tournament.value.slug}`,
    JSON.stringify({ entries: wheelEntries.value, history: wheelHistory.value }),
  );
}

function updateWheelEntries() {
  wheelEntries.value = wheelText.value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 100);
  persistWheel();
}

function copyParticipantsToWheel() {
  if (!tournament.value) return;
  wheelEntries.value = tournament.value.participants.map((participant) => participant.name);
  wheelText.value = wheelEntries.value.join("\n");
  wheelWinner.value = "";
  persistWheel();
  notice.value = "Participants copied into this wheel only.";
}

function shuffleWheel() {
  const entries = [...wheelEntries.value];
  for (let i = entries.length - 1; i > 0; i -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    const j = Math.floor(random * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  wheelEntries.value = entries;
  wheelText.value = entries.join("\n");
  persistWheel();
}

function clearWheel() {
  wheelEntries.value = [];
  wheelText.value = "";
  wheelWinner.value = "";
  wheelHistory.value = [];
  persistWheel();
}

async function spinWheel() {
  if (wheelSpinning.value || wheelEntries.value.length < 2) return;
  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  const index = random % wheelEntries.value.length;
  const segment = 360 / wheelEntries.value.length;
  const landing = 360 - (index * segment + segment / 2);
  wheelSpinning.value = true;
  wheelWinner.value = "";
  wheelRotation.value += 1440 + landing - (wheelRotation.value % 360);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    wheelWinner.value = wheelEntries.value[index];
    wheelSpinning.value = false;
  }, reduced ? 250 : 3600);
}

function removeWinner() {
  if (!wheelWinner.value) return;
  wheelHistory.value.push(wheelWinner.value);
  const index = wheelEntries.value.indexOf(wheelWinner.value);
  if (index >= 0) wheelEntries.value.splice(index, 1);
  wheelText.value = wheelEntries.value.join("\n");
  wheelWinner.value = "";
  persistWheel();
}

function requestFullscreen() {
  void document.documentElement.requestFullscreen?.();
}

function signIn(returnTo = "/account/tournaments") {
  window.location.href = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  user.value = null;
  navigate("/");
}

onMounted(async () => {
  path.value = window.location.pathname;
  window.addEventListener("popstate", () => {
    path.value = window.location.pathname;
    void loadRoute();
  });
  await loadSession();
  const draft = sessionStorage.getItem("bracket-create-draft");
  if (draft && new URLSearchParams(window.location.search).has("resume")) {
    createForm.value = JSON.parse(draft);
    sessionStorage.removeItem("bracket-create-draft");
    notice.value = user.value
      ? "Signed in. Review and create your long-term tournament."
      : "Your tournament draft is ready.";
  }
  await loadRoute();
});

onBeforeUnmount(() => window.clearInterval(versionTimer));

watch(wheelText, () => {
  if (route.value === "wheel") updateWheelEntries();
});
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <button v-if="route !== 'home'" class="back-link" @click="goBack" aria-label="Go back">←</button>
      <button class="wordmark" @click="navigate('/')">BRACKET</button>
      <nav class="header-nav" aria-label="Primary">
        <button v-if="route === 'home'" @click="navigate('/create')">Create</button>
        <button v-if="user" @click="navigate('/account/tournaments')">Saved tournaments</button>
        <button v-if="user" class="text-button" @click="logout">Sign out</button>
        <span v-else class="no-account-pill">No account needed</span>
      </nav>
    </header>

    <div v-if="remoteRevision" class="refresh-banner">
      <span>Changes have occurred — refresh to see.</span>
      <button @click="loadTournament">Refresh bracket</button>
    </div>
    <div v-if="error" class="message error-message" role="alert">
      <span>{{ error }}</span>
      <button @click="error = ''" aria-label="Dismiss">×</button>
    </div>
    <div v-if="notice" class="message notice-message" role="status">
      <span>{{ notice }}</span>
      <button @click="notice = ''" aria-label="Dismiss">×</button>
    </div>

    <main v-if="route === 'home'" class="home-page">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">FAST, FAIR, NO FUSS</p>
          <h1>Build the bracket.<br><span>Start the game.</span></h1>
          <p class="hero-lede">
            Create and run a tournament in minutes. No sign-up, no spreadsheet,
            no complicated setup.
          </p>
          <div class="hero-actions">
            <button class="primary-button" @click="navigate('/create')">Create a tournament <span>→</span></button>
            <span>Free for quick tournaments</span>
          </div>
        </div>
        <div class="hero-bracket" aria-label="Decorative tournament bracket">
          <div class="poster-label">SATURDAY / 8 PLAYERS</div>
          <div class="poster-grid">
            <div class="poster-round">
              <span>Ava</span><span>Noah</span><span>Mia</span><span>Leo</span>
            </div>
            <div class="poster-lines"></div>
            <div class="poster-round middle"><span>Ava</span><span>Mia</span></div>
            <div class="poster-lines short"></div>
            <div class="poster-round final"><b>Ava</b><small>CHAMPION</small></div>
          </div>
          <div class="poster-foot">NO ACCOUNTS. JUST GAMES.</div>
        </div>
      </section>

      <section class="process-strip">
        <article><b>01</b><h2>Add names</h2><p>Paste participants in seed order.</p></article>
        <article><b>02</b><h2>Pick a format</h2><p>Single, double, round robin, or Swiss.</p></article>
        <article><b>03</b><h2>Run it live</h2><p>Record winners and share the public page.</p></article>
      </section>
    </main>

    <main v-else-if="route === 'create'" class="create-page">
      <section class="create-intro">
        <p class="eyebrow">01 / FORMAT</p>
        <h1>Build a tournament<br>in minutes.</h1>
        <p>Choose a format, add your participants, and we’ll prepare the matches.</p>
        <div class="format-list">
          <button
            v-for="format in formats"
            :key="format.value"
            :class="{ selected: createForm.format === format.value }"
            @click="createForm.format = format.value"
          >
            <span class="radio-mark"></span>
            <span><b>{{ format.label }}</b><small>{{ format.description }}</small></span>
            <span class="format-glyph">┫</span>
          </button>
        </div>
      </section>
      <section class="create-form-panel">
        <label>
          <span>Tournament name</span>
          <input v-model="createForm.name" maxlength="80" placeholder="e.g. Summer Showdown">
        </label>
        <label>
          <span>Participants</span>
          <small>One name per line, ordered by seed</small>
          <textarea v-model="createForm.participants" rows="9"></textarea>
        </label>
        <label class="toggle-row">
          <span><b>Shuffle seeds</b><small>Randomize the starting order once.</small></span>
          <input v-model="createForm.shuffle" type="checkbox">
        </label>
        <fieldset class="expiry-fieldset">
          <legend>Keep tournament for</legend>
          <div class="expiry-grid">
            <button
              v-for="option in expiryOptions"
              :key="option.days"
              :class="{ selected: createForm.retentionDays === option.days }"
              @click="createForm.retentionDays = option.days"
            >
              <b>{{ option.label }}</b>
              <small v-if="option.account">Google account</small>
              <small v-else>No account</small>
            </button>
          </div>
        </fieldset>
        <button class="primary-button wide" :disabled="loading" @click="createTournament">
          {{ loading ? "Creating…" : "Create tournament" }} <span>→</span>
        </button>
        <p class="private-note">⌑ A private organizer link is created with your bracket.</p>
      </section>
    </main>

    <main v-else-if="route === 'account'" class="account-page">
      <div class="page-heading">
        <p class="eyebrow">YOUR ACCOUNT</p>
        <h1>Saved tournaments</h1>
        <p>Only one-month and one-year tournaments are attached to your Google account.</p>
      </div>
      <button v-if="!user" class="primary-button" @click="signIn()">Continue with Google</button>
      <div v-else class="saved-grid">
        <article v-for="item in accountTournaments" :key="String(item.slug)" class="saved-card">
          <small>{{ formatLabels[item.format as TournamentFormat] }}</small>
          <h2>{{ item.name }}</h2>
          <p>Expires {{ new Date(Number(item.expires_at)).toLocaleDateString() }}</p>
          <button @click="navigate(`/t/${item.slug}/manage`)">Open tournament →</button>
        </article>
        <p v-if="!accountTournaments.length && !loading" class="empty-state">No saved tournaments yet.</p>
      </div>
    </main>

    <main v-else-if="route === 'wheel'" class="wheel-page">
      <div v-if="loading" class="loading-state">Loading wheel…</div>
      <template v-else-if="tournament">
        <div class="wheel-topline">
          <div>
            <p class="eyebrow">INDEPENDENT TOOL</p>
            <h1>Name wheel</h1>
          </div>
          <button class="outline-button" @click="navigate(`/t/${slug}`)">Back to tournament</button>
        </div>
        <div class="independence-note">This wheel does not change participants, seeds, or results.</div>
        <section class="wheel-workspace">
          <div class="wheel-stage">
            <div class="wheel-pointer"></div>
            <div
              class="wheel-disc"
              :class="{ spinning: wheelSpinning }"
              :style="{ background: wheelGradient, transform: `rotate(${wheelRotation}deg)` }"
            >
              <span
                v-for="(entry, index) in wheelEntries"
                :key="`${entry}-${index}`"
                class="wheel-label"
                :style="{
                  transform: `rotate(${index * (360 / wheelEntries.length) + 180 / wheelEntries.length}deg) translateY(-12.5rem) rotate(90deg)`
                }"
              >{{ entry }}</span>
            </div>
            <button class="spin-button" :disabled="wheelEntries.length < 2 || wheelSpinning" @click="spinWheel">SPIN</button>
          </div>
          <aside class="wheel-controls">
            <div class="entries-panel">
              <h2>Entries</h2>
              <p>One name per line · maximum 100</p>
              <textarea v-model="wheelText" rows="12" placeholder="Add at least two names"></textarea>
              <button class="outline-button wide" @click="copyParticipantsToWheel">Copy tournament participants</button>
              <div class="inline-actions">
                <button @click="shuffleWheel">Shuffle</button>
                <button @click="clearWheel">Clear</button>
              </div>
            </div>
            <div class="last-pick-panel">
              <p class="eyebrow">LAST PICK</p>
              <h2>{{ wheelWinner || "—" }}</h2>
              <div v-if="wheelWinner" class="winner-actions">
                <button @click="spinWheel">Spin again</button>
                <button class="primary-mini" @click="removeWinner">Remove and continue</button>
              </div>
              <ol v-if="wheelHistory.length" class="pick-history">
                <li v-for="(name, index) in wheelHistory" :key="`${name}-${index}`">
                  <span>{{ String(index + 1).padStart(2, "0") }}</span>{{ name }}
                </li>
              </ol>
            </div>
          </aside>
        </section>
        <button class="fullscreen-button" @click="requestFullscreen">Enter fullscreen</button>
      </template>
    </main>

    <main v-else class="tournament-page">
      <div v-if="loading" class="loading-state">Loading tournament…</div>
      <template v-else-if="tournament">
        <section class="tournament-heading">
          <div>
            <p class="eyebrow">{{ isManager ? "ORGANIZER VIEW" : "PUBLIC VIEW" }}</p>
            <h1>{{ tournament.name }}</h1>
            <p>{{ tournament.participants.length }} players · {{ formatLabels[tournament.format] }} · {{ tournament.status }}</p>
          </div>
          <div class="tournament-actions">
            <button class="outline-button" @click="navigate(`/t/${slug}/wheel`)">Open name wheel</button>
            <button class="outline-button" @click="copyText(publicUrl(), 'Public link copied.')">Copy public link</button>
          </div>
        </section>

        <section v-if="winner" class="champion-strip">
          <span>CHAMPION</span><strong>{{ winner }}</strong><span class="champion-mark">┫</span>
        </section>

        <section v-if="isManager" class="organizer-note">
          <span>Private organizer access is saved on this device.</span>
          <div>
            <button @click="copyText(organizerUrl(), 'Organizer link copied.')">Copy organizer link</button>
            <button @click="undoResult">Undo latest result</button>
          </div>
        </section>

        <section class="bracket-layout">
          <div class="bracket-board">
            <div v-for="group in groupedMatches" :key="group.label" class="bracket-column">
              <h2>{{ group.label }}</h2>
              <article v-for="match in group.matches" :key="match.id" class="match-card">
                <button
                  :disabled="!isManager || match.status !== 'ready'"
                  :class="{ winner: match.winnerId === match.participantAId }"
                  @click="recordResult(match, match.participantAId)"
                >
                  <span>{{ participantName(tournament, match.participantAId) }}</span>
                  <b>{{ match.scoreA ?? "—" }}</b>
                </button>
                <button
                  :disabled="!isManager || match.status !== 'ready'"
                  :class="{ winner: match.winnerId === match.participantBId }"
                  @click="recordResult(match, match.participantBId)"
                >
                  <span>{{ participantName(tournament, match.participantBId) }}</span>
                  <b>{{ match.scoreB ?? "—" }}</b>
                </button>
                <div v-if="isManager && match.status === 'ready'" class="score-editor">
                  <input v-model.number="draftFor(match).a" type="number" min="0" max="999" :aria-label="`${participantName(tournament, match.participantAId)} score`">
                  <span>:</span>
                  <input v-model.number="draftFor(match).b" type="number" min="0" max="999" :aria-label="`${participantName(tournament, match.participantBId)} score`">
                  <button @click="saveScore(match)">Save score</button>
                </div>
                <button
                  v-if="isManager && (tournament.format === 'round-robin' || tournament.format === 'swiss') && match.status === 'ready'"
                  class="draw-button"
                  @click="recordResult(match, null, true)"
                >Record draw</button>
                <small><i :class="match.status"></i>{{ match.status }}</small>
              </article>
            </div>
          </div>
          <aside v-if="tournament.standings.length" class="standings-panel">
            <h2>Standings</h2>
            <div class="standing-head"><span>#</span><span>Player</span><span>Pts</span></div>
            <div v-for="(standing, index) in tournament.standings" :key="standing.participantId" class="standing-row">
              <span>{{ String(index + 1).padStart(2, "0") }}</span>
              <b>{{ participantName(tournament, standing.participantId) }}</b>
              <span>{{ standing.points }}</span>
            </div>
            <button
              v-if="isManager && tournament.format === 'swiss'"
              class="outline-button wide swiss-button"
              @click="generateSwissRound"
            >Generate next round</button>
          </aside>
        </section>

        <footer class="tournament-footer">
          <span>Expires {{ new Date(tournament.expiresAt).toLocaleDateString() }}</span>
          <div v-if="isManager" class="retention-controls">
            <label>
              Keep for
              <select v-model.number="retentionChoice">
                <option :value="1">1 day</option>
                <option :value="7">7 days</option>
                <option :value="14">2 weeks</option>
                <option :value="30">1 month · Google</option>
                <option :value="365">1 year · Google</option>
              </select>
            </label>
            <button class="outline-button" @click="updateRetention">Update</button>
            <button class="danger-link" @click="deleteTournament">Delete tournament</button>
          </div>
          <button v-else class="primary-button" @click="navigate('/create')">Create your own bracket</button>
        </footer>
      </template>
    </main>
  </div>
</template>
