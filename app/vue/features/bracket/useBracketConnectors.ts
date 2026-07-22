import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import type { Match, TournamentFormat, TournamentSnapshot } from "../../../../lib/tournament";

type Connector = { id: string; d: string; loser: boolean; roundFlow?: boolean };

export function useBracketConnectors(input: {
  tournament: Ref<TournamentSnapshot | null>;
  displayedMatches: Ref<Match[]>;
  displayedFormat: Ref<TournamentFormat>;
}) {
  const root = ref<HTMLElement | null>(null);
  const paths = ref<Record<string, Connector[]>>({});
  const sizes = ref<Record<string, { width: number; height: number }>>({});
  let observer: ResizeObserver | undefined;

  async function update() {
    await nextTick();
    if (!root.value || !input.tournament.value) {
      paths.value = {};
      return;
    }
    const nextPaths: Record<string, Connector[]> = {};
    const nextSizes: Record<string, { width: number; height: number }> = {};
    for (const canvas of root.value.querySelectorAll<HTMLElement>(".bracket-canvas")) {
      const sectionId = canvas.dataset.section ?? "main";
      const canvasRect = canvas.getBoundingClientRect();
      nextSizes[sectionId] = { width: canvas.scrollWidth, height: canvas.scrollHeight };
      const connectors: Connector[] = [];
      const addPath = (source: Match, targetId: string | undefined, loser: boolean) => {
        if (!targetId) return;
        const sourceElement = canvas.querySelector<HTMLElement>(`[data-match-id="${source.id}"]`);
        const targetElement = canvas.querySelector<HTMLElement>(`[data-match-id="${targetId}"]`);
        if (!sourceElement || !targetElement) return;
        const sourceRect = sourceElement.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();
        const sameColumn = Math.abs(sourceRect.left - targetRect.left) < 12;
        if (sameColumn && targetRect.top > sourceRect.bottom) {
          const x = sourceRect.left - canvasRect.left + sourceRect.width / 2;
          connectors.push({ id: `${source.id}-${targetId}-${loser ? "loser" : "winner"}`, d: `M ${x} ${sourceRect.bottom - canvasRect.top} V ${targetRect.top - canvasRect.top}`, loser });
          return;
        }
        const x1 = sourceRect.right - canvasRect.left;
        const y1 = sourceRect.top - canvasRect.top + sourceRect.height / 2;
        const x2 = targetRect.left - canvasRect.left;
        const y2 = targetRect.top - canvasRect.top + targetRect.height / 2;
        const middle = x1 + Math.max(24, (x2 - x1) / 2);
        connectors.push({ id: `${source.id}-${targetId}-${loser ? "loser" : "winner"}`, d: `M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`, loser });
      };
      for (const match of input.displayedMatches.value) {
        if (sectionId === "double" || sectionId !== "losers") addPath(match, match.nextMatchId, false);
      }
      if (["round-robin", "swiss", "groups"].includes(input.displayedFormat.value)) {
        const headings = [...canvas.querySelectorAll<HTMLElement>(".bracket-column h2")];
        for (let index = 0; index < headings.length - 1; index += 1) {
          const sourceRect = headings[index].getBoundingClientRect();
          const targetRect = headings[index + 1].getBoundingClientRect();
          const y = sourceRect.top - canvasRect.top + sourceRect.height / 2;
          connectors.push({ id: `round-flow-${index}`, d: `M ${sourceRect.right - canvasRect.left + 12} ${y} H ${targetRect.left - canvasRect.left - 12}`, loser: false, roundFlow: true });
        }
      }
      nextPaths[sectionId] = connectors;
    }
    paths.value = nextPaths;
    sizes.value = nextSizes;
  }

  watch(root, (element) => {
    observer?.disconnect();
    if (!element) return;
    observer = new ResizeObserver(() => void update());
    observer.observe(element);
    void update();
  });
  watch([input.tournament, input.displayedMatches, input.displayedFormat], () => void update(), { deep: true });
  onMounted(() => window.addEventListener("resize", update));
  onBeforeUnmount(() => {
    observer?.disconnect();
    window.removeEventListener("resize", update);
  });

  return { root, paths, sizes, update };
}
