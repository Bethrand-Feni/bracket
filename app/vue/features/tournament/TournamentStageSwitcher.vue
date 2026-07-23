<script setup lang="ts">
import type { TournamentStageId } from "../../../../lib/tournament";

defineProps<{
  stages: Array<{ id: TournamentStageId; label: string; status: string }>;
  selectedStageId: TournamentStageId;
  activeStageId?: TournamentStageId;
}>();
defineEmits<{ select: [stageId: TournamentStageId] }>();
</script>

<template>
  <nav v-if="stages.length > 1" class="my-6 flex items-stretch overflow-x-auto border-y border-ink/20" aria-label="Tournament stages">
    <template v-for="(stage, index) in stages" :key="stage.id">
      <button
        class="stage-item relative grid min-w-36 flex-1 gap-1 px-4 py-4 text-left transition-colors"
        :class="[
          `stage-${stage.status}`,
          selectedStageId === stage.id ? 'selected bg-blue text-paper' : 'hover:bg-modest/45',
          ['pending', 'preview'].includes(stage.status) && selectedStageId !== stage.id ? 'opacity-45' : '',
          ['complete', 'locked', 'confirmed'].includes(stage.status) ? '[&_span]:line-through' : '',
          activeStageId === stage.id ? 'current after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:bg-blue' : '',
        ]"
        :aria-current="activeStageId === stage.id ? 'step' : undefined"
        @click="$emit('select', stage.id)"
      >
        <small class="text-[.6rem] font-bold tracking-[.12em] opacity-70">{{ String(index + 1).padStart(2, "0") }}</small>
        <span class="font-display text-lg font-semibold">{{ stage.label }}</span>
        <i class="text-[.6rem] not-italic uppercase tracking-[.1em] opacity-70">{{ stage.status }}</i>
      </button>
      <span v-if="index < stages.length - 1" class="grid place-items-center border-x border-ink/15 px-2 text-blue">→</span>
    </template>
  </nav>
</template>
