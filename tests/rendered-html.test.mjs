import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the Vue application shell with product metadata", async () => {
  const html = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>BRACKET — Start the game<\/title>/i);
  assert.match(html, /id="app"/);
  assert.match(html, /Preparing your tournament/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /react|vinext/i);
});

test("keeps Vue, direct Worker assets, and D1 wired", async () => {
  const [entry, worker, wrangler, packageJson, generatedConfig] = await Promise.all([
    readFile(new URL("../app/vue/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../dist/bracket_tournament_creator/wrangler.json", import.meta.url), "utf8"),
  ]);
  assert.match(entry, /createApp/);
  assert.match(worker, /handleApi/);
  assert.match(worker, /ASSETS/);
  assert.match(wrangler, /"not_found_handling": "single-page-application"/);
  assert.match(wrangler, /"binding": "DB"/);
  assert.match(generatedConfig, /"directory":"\.\.\/client"/);
  assert.doesNotMatch(packageJson, /next|react|vinext/i);
  await access(new URL("../dist/client/assets", import.meta.url));
});

test("keeps the application Tailwind-only outside bracket geometry", async () => {
  const [globals, packageJson, bracketCss] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/vue/features/bracket/bracket.css", import.meta.url), "utf8"),
  ]);
  assert.equal(globals.trim(), '@import "./styles/base.css";');
  assert.match(bracketCss, /\.bracket-connectors/);
  assert.match(bracketCss, /\.bracket-canvas/);
  assert.doesNotMatch(packageJson, /next|react|vinext|sites/i);
  for (const path of ["create.css", "tournament.css", "stages.css", "responsive.css", "responsive-legacy.css"]) {
    await assert.rejects(access(new URL(`../app/styles/${path}`, import.meta.url)));
  }
});
