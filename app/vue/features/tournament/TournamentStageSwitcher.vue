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
  <nav v-if="stages.length > 1" class="stage-switcher" aria-label="Tournament stages">
    <template v-for="(stage, index) in stages" :key="stage.id">
      <button
        :class="[`stage-${stage.status}`, { selected: selectedStageId === stage.id, current: activeStageId === stage.id }]"
        :aria-current="activeStageId === stage.id ? 'step' : undefined"
        @click="$emit('select', stage.id)"
      >
        <small>{{ String(index + 1).padStart(2, "0") }}</small>
        <span>{{ stage.label }}</span>
        <i>{{ stage.status }}</i>
      </button>
      <span v-if="index < stages.length - 1" class="stage-arrow">→</span>
    </template>
  </nav>
</template>
