<script setup lang="ts">
defineProps<{
  loading: boolean;
  available: boolean;
  basePath: string;
  entries: string[];
  history: string[];
  rotation: number;
  spinning: boolean;
  winner: string;
  gradient: string;
  labelTransform: (index: number) => string;
}>();
const wheelText = defineModel<string>({ required: true });
defineEmits<{
  navigate: [path: string];
  copyParticipants: [];
  shuffle: [];
  clear: [];
  spin: [];
  removeWinner: [];
  fullscreen: [];
}>();
</script>

<template>
  <main class="wheel-page">
    <div v-if="loading" class="loading-state">Loading wheel…</div>
    <template v-else-if="available">
      <div class="wheel-topline">
        <div><p class="eyebrow">INDEPENDENT TOOL</p><h1>Name wheel</h1></div>
        <button class="outline-button" @click="$emit('navigate', basePath)">Back to tournament</button>
      </div>
      <div class="independence-note">This wheel does not change participants, seeds, or results.</div>
      <section class="wheel-workspace">
        <div class="wheel-stage">
          <div class="wheel-pointer"></div>
          <div class="wheel-disc" :class="{ spinning }" :style="{ background: gradient, transform: `rotate(${rotation}deg)` }">
            <span v-for="(entry, index) in entries" :key="`${entry}-${index}`" class="wheel-label" :style="{ transform: labelTransform(index) }">{{ entry }}</span>
          </div>
          <button class="spin-button" :disabled="entries.length < 2 || spinning" @click="$emit('spin')">SPIN</button>
          <div v-if="winner" class="wheel-winner-overlay" aria-live="polite"><small>SELECTED</small><strong>{{ winner }}</strong></div>
        </div>
        <aside class="wheel-controls">
          <div class="entries-panel">
            <h2>Entries</h2><p>One name per line · maximum 100</p>
            <textarea v-model="wheelText" rows="12" placeholder="Add at least two names"></textarea>
            <button class="outline-button wide" @click="$emit('copyParticipants')">Copy tournament participants</button>
            <div class="inline-actions"><button @click="$emit('shuffle')">Shuffle</button><button @click="$emit('clear')">Clear</button></div>
          </div>
          <div class="last-pick-panel">
            <p class="eyebrow">LAST PICK</p><h2>{{ winner || "—" }}</h2>
            <div v-if="winner" class="winner-actions"><button @click="$emit('spin')">Spin again</button><button class="primary-mini" @click="$emit('removeWinner')">Remove and continue</button></div>
            <ol v-if="history.length" class="pick-history"><li v-for="(name, index) in history" :key="`${name}-${index}`"><span>{{ String(index + 1).padStart(2, "0") }}</span>{{ name }}</li></ol>
          </div>
        </aside>
      </section>
      <button class="fullscreen-button" @click="$emit('fullscreen')">Enter fullscreen</button>
    </template>
  </main>
</template>
