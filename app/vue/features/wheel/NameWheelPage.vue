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
  <main class="mx-auto min-h-[calc(100vh-80px)] w-full max-w-[1600px] px-[4vw] py-10">
    <div v-if="loading" class="grid min-h-80 place-items-center text-ink/60">Loading wheel…</div>
    <template v-else-if="available">
      <div class="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div><p class="mb-3 text-xs font-extrabold tracking-[0.13em] text-blue">INDEPENDENT TOOL</p><h1 class="font-display text-5xl font-semibold tracking-[-0.05em] sm:text-7xl">Name wheel</h1></div>
        <button class="rounded-brand border border-blue px-4 py-2 font-display font-semibold text-blue hover:bg-blue hover:text-paper" @click="$emit('navigate', basePath)">Back to tournament</button>
      </div>
      <div class="mb-8 border border-ink/20 bg-modest px-4 py-3 text-sm">This wheel does not change participants, seeds, or results.</div>
      <section class="grid gap-10 lg:grid-cols-[minmax(420px,1.25fr)_minmax(320px,.75fr)]">
        <div class="relative grid min-h-[620px] place-items-center overflow-hidden texture-blue p-10">
          <div class="absolute left-1/2 top-6 z-10 -translate-x-1/2 border-x-[18px] border-t-[32px] border-x-transparent border-t-paper"></div>
          <div class="relative aspect-square w-[min(78vw,560px)] rounded-full border-[10px] border-paper shadow-2xl transition-transform duration-[3600ms] ease-[cubic-bezier(.17,.67,.12,1)]" :class="{ 'duration-200': !spinning }" :style="{ background: gradient, transform: `rotate(${rotation}deg)`, '--wheel-label-radius': 'clamp(120px, 19vw, 210px)' }">
            <span v-for="(entry, index) in entries" :key="`${entry}-${index}`" class="absolute left-1/2 top-1/2 z-10 max-w-[34%] origin-center truncate font-display text-sm font-semibold !text-paper drop-shadow sm:text-base" :style="{ transform: labelTransform(index) }">{{ entry }}</span>
          </div>
          <button class="absolute rounded-full border-4 border-paper bg-blue px-8 py-6 font-display text-xl font-bold !text-paper shadow-xl disabled:opacity-50" :disabled="entries.length < 2 || spinning" @click="$emit('spin')">SPIN</button>
          <div v-if="winner" class="absolute bottom-8 left-1/2 z-20 grid -translate-x-1/2 gap-1 rounded-brand border border-paper bg-ink px-8 py-4 text-center text-paper shadow-xl" aria-live="polite"><small class="text-[10px] tracking-[0.15em]">SELECTED</small><strong class="font-display text-2xl">{{ winner }}</strong></div>
        </div>
        <aside class="grid content-start gap-5">
          <div class="texture-paper border border-ink/20 p-5">
            <h2 class="font-display text-2xl font-semibold">Entries</h2><p class="mb-4 text-sm text-ink/60">One name per line · maximum 100</p>
            <textarea v-model="wheelText" class="min-h-64 w-full rounded-brand border border-ink/25 bg-paper p-3" rows="12" placeholder="Add at least two names"></textarea>
            <button class="mt-4 w-full rounded-brand border border-blue px-4 py-2 font-semibold text-blue hover:bg-blue hover:text-paper" @click="$emit('copyParticipants')">Copy tournament participants</button>
            <div class="mt-3 grid grid-cols-2 gap-3"><button class="border border-ink/20 p-2" @click="$emit('shuffle')">Shuffle</button><button class="border border-ink/20 p-2" @click="$emit('clear')">Clear</button></div>
          </div>
          <div class="border border-ink/20 bg-modest p-5">
            <p class="mb-3 text-xs font-extrabold tracking-[0.13em] text-blue">LAST PICK</p><h2 class="font-display text-3xl font-semibold">{{ winner || "—" }}</h2>
            <div v-if="winner" class="mt-4 flex flex-wrap gap-3"><button class="underline" @click="$emit('spin')">Spin again</button><button class="rounded-brand bg-blue px-3 py-2 text-paper" @click="$emit('removeWinner')">Remove and continue</button></div>
            <ol v-if="history.length" class="mt-5 divide-y divide-ink/15"><li v-for="(name, index) in history" :key="`${name}-${index}`" class="flex gap-3 py-2"><span class="text-ink/50">{{ String(index + 1).padStart(2, "0") }}</span>{{ name }}</li></ol>
          </div>
        </aside>
      </section>
      <button class="mt-6 text-sm font-semibold text-blue underline" @click="$emit('fullscreen')">Enter fullscreen</button>
    </template>
  </main>
</template>
