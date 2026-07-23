# BRACKET

Local-first tournament creation built with Vue 3, Vite, Vue Router, and Tailwind CSS v4. Tournaments run without an account and are stored in the browser. Optional hosted copies use a direct Cloudflare Worker, D1, and Google OAuth.

## Local development

```bash
npm install
npm run dev
```

The Cloudflare Vite plugin supplies a local Worker runtime and D1 binding. The Vue development URL printed by Vite is the application URL.

## Commands

- `npm run dev` — run Vue and the Worker locally
- `npm run build` — produce the client and Worker bundles
- `npm run start` — preview the production build locally
- `npm run lint` — check TypeScript and Vue files
- `npm run test:unit` — run unit and component tests
- `npm test` — build and verify the production artifacts
- `npm run deploy` — build and deploy through Wrangler

## Direct Worker configuration

Create a D1 database named `bracket-tournaments`, replace the placeholder database ID in `wrangler.jsonc`, then configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_ORIGIN` for the deployed Worker. The `DB` binding is the only durable server-side resource.

Browser-local tournaments do not depend on Worker configuration, D1, deployment, or sign-in.
