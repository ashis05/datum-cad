<p align="center">
  <picture>
    <source media="(max-width: 600px)" srcset="docs/readme/sheet-mobile.svg">
    <img src="docs/readme/sheet.svg" alt="Datum, drawn as an engineering sheet. Describe a part in plain English. An LLM writes parametric Replicad code, OpenCascade builds an exact solid in your browser, and you export STEP or STL. Pipeline: prompt, Gemini, OpenCascade kernel in a Web Worker, viewport, export." width="100%">
  </picture>
</p>

<p align="center"><b><a href="https://datum.ashiswadhwani.in">datum.ashiswadhwani.in</a></b> · describe a part, get a real solid</p>

<details>
<summary><b>More views</b></summary>
<br>
<table>
<tr>
<td align="center" width="60%"><img src="docs/readme/shots/desktop-empty.png" alt="Empty workbench with example prompts" width="100%"><br><sub>Empty workbench with example prompts</sub></td>
<td align="center" width="20%"><img src="docs/readme/shots/mobile-empty.png" alt="Phone, empty" width="100%"><br><sub>Phone</sub></td>
<td align="center" width="20%"><img src="docs/readme/shots/mobile-params.png" alt="Phone, parameters tab" width="100%"><br><sub>Parameters tab</sub></td>
</tr>
</table>
</details>

---

## How it works

```
prompt ──▶ /api/generate ──▶ Gemini 2.5 Flash-Lite ──▶ { code, params, notes }
                (server; holds the key)                         │
                                                                ▼
             Web Worker: Replicad + OpenCascade (WASM) ──▶ exact BREP solid
                     │                                         │
                     ▼                                         ▼
          mesh ──▶ three.js viewport                 STEP / STL download
```

- **The BREP solid is the source of truth.** The viewport shows a mesh of it; exports come from the solid itself.
- **Sliders never call the AI.** Every dimension the model declares becomes a parameter, and dragging one re-runs the same code in the worker.
- **Broken code fixes itself.** If the kernel rejects the generated code, the decoded error and the code go back to the model, up to two retries.
- **The key never reaches the browser.** The Gemini key lives in the server route only.
- **Accounts are optional.** Anyone can try it with a small per-IP allowance. Signing in with Google or GitHub raises the limit and saves every design conversation to your history, so you can reopen a part later and keep editing it.

## Run it locally

Needs Node 20+, a [Google AI Studio](https://aistudio.google.com/apikey) key (the free tier works) and, for accounts and history, a [Neon](https://neon.tech) Postgres database.

```bash
npm install
cp .env.example .env.local      # then fill in .env.local (see below)
npm run db:migrate              # create the tables in Neon (needs DATABASE_URL)
npm run dev                     # http://localhost:3000
```

Without `DATABASE_URL` the app still runs: rate limits fall back to in-memory counters and history is turned off.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `GEMINI_API_KEY` | yes | | Server-side key for the generate route |
| `GEMINI_MODEL` | no | `gemini-2.5-flash-lite` | Model id, if you want a different one |
| `DATABASE_URL` | for accounts | | Neon connection string (pooled). Users, history, rate-limit counters |
| `AUTH_SECRET` | for accounts | | Session signing key: `npx auth secret` or `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | for Google sign-in | | OAuth client from Google Cloud Console |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | for GitHub sign-in | | OAuth app from GitHub developer settings |
| `RATE_LIMIT_ANON_PER_MINUTE` / `_PER_DAY` | no | `3` / `10` | Signed-out limit, per IP |
| `RATE_LIMIT_USER_PER_MINUTE` / `_PER_DAY` | no | `10` / `100` | Signed-in limit, per user |
| `RATE_LIMIT_PRO_PER_MINUTE` / `_PER_DAY` | no | `30` / `500` | Limit for users with `tier = 'pro'` |
| `NEXT_PUBLIC_SITE_URL` | no | `http://localhost:3000` | Absolute URL used for Open Graph images |

OAuth callback URLs: `<site>/api/auth/callback/google` and `<site>/api/auth/callback/github`.

To give someone the higher limit: `update "user" set tier = 'pro' where email = '…';` To block an account: `set disabled = true`.

## Deploy on Vercel

It's a plain Next.js app at the repo root, so no config file is needed:

1. Import the repo in Vercel (framework preset: Next.js).
2. Add `GEMINI_API_KEY`, `NEXT_PUBLIC_SITE_URL` (for this deployment, `https://datum.ashiswadhwani.in`), `DATABASE_URL`, `AUTH_SECRET` and the four `AUTH_GOOGLE_*` / `AUTH_GITHUB_*` values under Environment Variables. The Neon integration in the Vercel marketplace can set `DATABASE_URL` for you.
3. Run `npm run db:migrate` once against the production database (and again whenever a new file appears in `drizzle/`).
4. Deploy. Every push to `master` redeploys production.

The 10.8 MB OpenCascade WASM ships from `public/` as a static file; all CAD work runs in the visitor's browser, so the server only proxies the model call, handles sign-in and stores history.

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Vitest: self-correction loop, output sanitising, rate limiter, API routes |
| `npm run db:generate` · `npm run db:migrate` | Drizzle: write a migration from `schema.ts` · apply migrations to `DATABASE_URL` |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |

## Project layout

```
auth.ts                   Auth.js: Google + GitHub, JWT sessions, Drizzle adapter
app/
  api/generate/route.ts   POST: validate, rate-limit per user/IP, call Gemini, map errors
  api/usage/route.ts      GET: your tier and remaining generations (doesn't count)
  api/conversations/      chat history CRUD (signed-in users only)
  api/auth/[...nextauth]  OAuth sign-in/callback routes
  api/health/route.ts     GET: status, model, whether a key is set
  page.tsx · layout.tsx   the workbench page, metadata, OG image, icon
components/cad/           CadStage (layout), useCadSession (state), Viewport,
                          Conversation, ParamPanel, ViewportToolbar, TopBar
lib/
  server/                 gemini.ts, systemPrompt.ts (Replicad cheatsheet),
                          sanitize.ts, rateLimit.ts, identity.ts, history.ts
  server/db/              Drizzle schema + Neon client
drizzle/                  SQL migrations
  replicad/               kernel.worker.ts, kernel.ts, kernelClient.ts, mesh.ts
  selfCorrect.ts          generate → build → retry with the decoded error
  api.ts                  browser client + shared API contracts and error codes
public/replicad_single.wasm   OpenCascade compiled to WebAssembly
docs/                     original spec, build log, README image tooling
```

## Limits worth knowing

- **Free-tier quota.** Gemini's free tier allows about 20 generations a day for Flash-Lite. Slider changes are free; each self-correction retry costs one generation.
- **Rate limits live in Postgres.** Counters are shared by every server instance, keyed by user id when signed in and by IP otherwise. Every Gemini call counts, including self-correction retries. If the database is unreachable, a request falls back to that instance's in-memory counter rather than failing.
- **Generated code runs in your browser.** It runs inside the Web Worker with network and messaging globals hidden from it and a 20-second build timeout, but it is still model-written JavaScript.
- **Simple and medium parts work best.** One to a few features (plates, brackets, flanges, standoffs, trays) build reliably. Dense parts with many interacting fillets may need a follow-up prompt.

## Regenerating the README images

```bash
cd docs/readme
npm install --no-save --no-package-lock playwright && npx playwright install chromium   # once
node shoot.cjs          # needs the app running at http://localhost:3000; reuses shots/fixture.json
python3 make_svg.py     # rebuilds sheet.svg + sheet-mobile.svg
```

`shoot.cjs` only calls Gemini when `shots/fixture.json` is missing; delete it to draw a new part.

## License

[MIT](LICENSE) © 2026 Ashis Wadhwani
