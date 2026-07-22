<script setup lang="ts">
import { formatLabels } from "../../../../lib/tournament";
import type { LocalTournamentRecord } from "../../../local-tournaments";

defineProps<{ tournaments: LocalTournamentRecord[] }>();
defineEmits<{ navigate: [path: string]; import: [] }>();
</script>

<template>
  <main class="home-page">
    <section class="hero">
      <div class="hero-copy">
        <h1>Build the bracket.<br><span>Start the game.</span></h1>
        <p class="hero-lede">Create and run a tournament in minutes. No sign-up, no spreadsheet, no complicated setup.</p>
        <div class="hero-actions">
          <button class="primary-button" @click="$emit('navigate', '/create')">Create a tournament <span>→</span></button>
          <span>Free and local by default</span>
        </div>
        <button v-if="tournaments[0]" class="continue-local" @click="$emit('navigate', `/local/${tournaments[0].localId}/manage`)">
          <span><small>CONTINUE LOCALLY</small>{{ tournaments[0].snapshot.name }}</span><b>→</b>
        </button>
      </div>
      <div class="hero-bracket" aria-label="Decorative tournament bracket">
        <div class="poster-label">SATURDAY / 8 PLAYERS</div>
        <div class="poster-grid">
          <div class="poster-round"><span>Ava</span><span>Noah</span><span>Mia</span><span>Leo</span></div>
          <div class="poster-lines"></div>
          <div class="poster-round middle"><span>Ava</span><span>Mia</span></div>
          <div class="poster-lines short"></div>
          <div class="poster-round final"><b>Ava</b><small>CHAMPION</small></div>
        </div>
        <div class="poster-foot">NO ACCOUNTS. JUST GAMES.</div>
      </div>
    </section>
    <section v-if="tournaments.length" class="local-library">
      <div class="library-heading">
        <div><p class="eyebrow">THIS BROWSER</p><h2>Your local tournaments</h2></div>
        <button class="outline-button" @click="$emit('import')">Import tournament</button>
      </div>
      <div class="saved-grid">
        <article v-for="item in tournaments" :key="item.localId" class="saved-card">
          <small>{{ formatLabels[item.snapshot.format] }}</small>
          <h2>{{ item.snapshot.name }}</h2>
          <p>{{ item.snapshot.participants.length }} players · {{ item.snapshot.status }}</p>
          <button @click="$emit('navigate', `/local/${item.localId}/manage`)">Continue locally →</button>
        </article>
      </div>
      <p class="browser-warning">Stored only in this browser. Clearing browser data removes these tournaments, so export anything you cannot afford to lose.</p>
    </section>
  </main>
</template>
