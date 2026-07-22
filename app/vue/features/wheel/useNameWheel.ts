import { computed, ref, watch, type Ref } from "vue";
import type { TournamentSnapshot } from "../../../../lib/tournament";

export function useNameWheel(
  tournament: Ref<TournamentSnapshot | null>,
  storageKey: Ref<string>,
  notify: (message: string) => void,
) {
  const entries = ref<string[]>([]);
  const text = ref("");
  const history = ref<string[]>([]);
  const rotation = ref(0);
  const spinning = ref(false);
  const winner = ref("");

  const gradient = computed(() => {
    const count = Math.max(entries.value.length, 1);
    const colors = ["#0725b0", "#6b4a3a", "#e5ded4", "#f2efea"];
    const stops = Array.from({ length: count }, (_, index) => {
      const start = (index / count) * 360;
      const end = ((index + 1) / count) * 360;
      return `${colors[index % colors.length]} ${start}deg ${end}deg`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  });

  function persist() {
    if (!tournament.value || !storageKey.value) return;
    sessionStorage.setItem(
      `bracket-wheel-${storageKey.value}`,
      JSON.stringify({ entries: entries.value, history: history.value }),
    );
  }

  function load() {
    if (!tournament.value || !storageKey.value) return;
    const saved = sessionStorage.getItem(`bracket-wheel-${storageKey.value}`);
    if (saved) {
      const parsed = JSON.parse(saved) as { entries: string[]; history: string[] };
      entries.value = parsed.entries;
      history.value = parsed.history;
    } else {
      entries.value = tournament.value.participants.map(({ name }) => name);
      history.value = [];
      persist();
    }
    text.value = entries.value.join("\n");
  }

  function copyParticipants() {
    if (!tournament.value) return;
    entries.value = tournament.value.participants.map(({ name }) => name);
    text.value = entries.value.join("\n");
    winner.value = "";
    persist();
    notify("Participants copied into this wheel only.");
  }

  function shuffle() {
    const next = [...entries.value];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
      const swapIndex = Math.floor(random * (index + 1));
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }
    entries.value = next;
    text.value = next.join("\n");
    persist();
  }

  function clear() {
    entries.value = [];
    text.value = "";
    winner.value = "";
    history.value = [];
    persist();
  }

  async function spin() {
    if (spinning.value || entries.value.length < 2) return;
    const index = crypto.getRandomValues(new Uint32Array(1))[0] % entries.value.length;
    const segment = 360 / entries.value.length;
    const landing = 360 - (index * segment + segment / 2);
    spinning.value = true;
    winner.value = "";
    rotation.value += 1440 + landing - (rotation.value % 360);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      winner.value = entries.value[index];
      spinning.value = false;
    }, reduced ? 250 : 3600);
  }

  function removeWinner() {
    if (!winner.value) return;
    history.value.push(winner.value);
    const index = entries.value.indexOf(winner.value);
    if (index >= 0) entries.value.splice(index, 1);
    text.value = entries.value.join("\n");
    winner.value = "";
    persist();
  }

  function labelTransform(index: number) {
    const angle = index * (360 / entries.value.length) + 180 / entries.value.length;
    return `translate(-50%, -50%) rotate(${angle}deg) translateY(calc(var(--wheel-label-radius) * -1)) rotate(${-angle - rotation.value}deg)`;
  }

  watch(text, () => {
    entries.value = text.value
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 100);
    persist();
  });

  return { entries, text, history, rotation, spinning, winner, gradient, load, copyParticipants, shuffle, clear, spin, removeWinner, labelTransform };
}
