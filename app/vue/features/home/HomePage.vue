<script setup lang="ts">
import { formatLabels } from "../../../../lib/tournament";
import type { LocalTournamentRecord } from "../../../local-tournaments";
import AppButton from "../../components/ui/AppButton.vue";
import AppCard from "../../components/ui/AppCard.vue";

defineProps<{ tournaments: LocalTournamentRecord[] }>();
defineEmits<{ navigate: [path: string]; import: [] }>();
</script>

<template>
  <main>
    <section class="grid min-h-[calc(100vh-80px)] lg:grid-cols-[minmax(0,1fr)_minmax(420px,.83fr)]">
      <div class="self-center px-[5vw] py-16 lg:py-[7vw]">
        <h1 class="font-display text-[clamp(3.2rem,6vw,6.9rem)] font-semibold leading-[.92] tracking-[-.065em]">Build the bracket.<br><span class="text-blue">Start the game.</span></h1>
        <p class="my-8 max-w-xl text-[clamp(1rem,1.4vw,1.3rem)] leading-7">Create and run a tournament in minutes. No sign-up, no spreadsheet, no complicated setup.</p>
        <div class="flex flex-wrap items-center gap-5">
          <AppButton variant="primary" @click="$emit('navigate', '/create')">Create a tournament <span class="ml-4">→</span></AppButton>
          <span class="text-xs text-ink/65">Free and local by default</span>
        </div>
        <button v-if="tournaments[0]" class="mt-8 flex w-full max-w-lg items-center justify-between gap-4 border border-ink/20 border-l-[3px] border-l-blue p-4 text-left hover:bg-modest/40" @click="$emit('navigate', `/local/${tournaments[0].localId}/manage`)">
          <span><small class="mb-1 block text-[.6rem] font-bold tracking-[.12em] text-blue">CONTINUE LOCALLY</small>{{ tournaments[0].snapshot.name }}</span><b class="text-xl text-blue">→</b>
        </button>
      </div>
      <div class="texture-blue flex min-h-[560px] flex-col justify-between p-8 text-paper lg:min-h-[620px]" aria-label="Decorative tournament bracket">
        <div class="text-[.68rem] font-extrabold tracking-[.16em]">SATURDAY / 8 PLAYERS</div>
        <div class="grid grid-cols-[1fr_52px_1fr_52px_1fr] items-center">
          <div class="grid gap-5 [&_span]:border [&_span]:border-paper/60 [&_span]:p-3 [&_span]:text-xs"><span>Ava</span><span>Noah</span><span>Mia</span><span>Leo</span></div>
          <div class="h-[58%] border-y border-r border-paper"></div>
          <div class="grid gap-5 [&_span]:border [&_span]:border-paper/60 [&_span]:p-3 [&_span]:text-xs"><span>Ava</span><span>Mia</span></div>
          <div class="h-px border-t border-paper"></div>
          <div class="grid gap-2"><b class="border border-paper bg-paper p-3 font-display text-xl text-blue">Ava</b><small class="text-[.55rem] tracking-[.13em]">CHAMPION</small></div>
        </div>
        <div class="text-[.68rem] font-extrabold tracking-[.16em]">NO ACCOUNTS. JUST GAMES.</div>
      </div>
    </section>
    <section v-if="tournaments.length" class="border-t border-ink/20 px-[4vw] py-12">
      <div class="mb-6 flex items-end justify-between gap-8">
        <div><p class="mb-3 text-xs font-extrabold tracking-[.13em] text-blue">THIS BROWSER</p><h2 class="font-display text-[clamp(2rem,4vw,3.8rem)] font-semibold tracking-[-.045em] text-blue">Your local tournaments</h2></div>
        <AppButton @click="$emit('import')">Import tournament</AppButton>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AppCard v-for="item in tournaments" :key="item.localId" interactive>
          <small class="text-xs font-bold uppercase tracking-[.1em] text-blue">{{ formatLabels[item.snapshot.format] }}</small>
          <h2 class="my-3 font-display text-2xl font-semibold">{{ item.snapshot.name }}</h2>
          <p>{{ item.snapshot.participants.length }} players · {{ item.snapshot.status }}</p>
          <button class="mt-5 font-semibold text-blue underline" @click="$emit('navigate', `/local/${item.localId}/manage`)">Continue locally →</button>
        </AppCard>
      </div>
      <p class="mt-6 max-w-3xl border-l-[3px] border-brown pl-3 text-xs leading-6 text-brown">Stored only in this browser. Clearing browser data removes these tournaments, so export anything you cannot afford to lose.</p>
    </section>
  </main>
</template>
