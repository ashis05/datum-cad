# SESSION — Text-to-CAD prototype (handoff / resume state)

> **Purpose:** portable, in-repo memory so this build can be resumed from any device.
> A fresh Claude/agent session should **read this file first**, then `prototype.md`.
> Keep this file updated at every phase boundary (it's committed to git).

**Last updated:** 2026-06-09 (after Phase B — Replicad renders)
**Branch:** `master` · **Status:** Phase B complete, awaiting user verification → then Phase C

---

## How to resume (do this first)

1. `git pull` then read **`prototype.md`** — the decisions-locked spec / source of truth.
2. Read this file's **Current state** + **Phase tracker** below.
3. `npm install` at repo root (npm workspaces), then `npm run dev` (starts both apps).
4. Make sure **`backend/.env`** exists with a real `GEMINI_API_KEY` (gitignored — NOT in repo;
   copy `backend/.env.example`). Needed from Phase C onward.
5. Continue from the first ☐ phase in the tracker.

## Working agreement (carry through every phase)

- Build in the **exact §8 phase order** in `prototype.md` — do NOT reorder.
  - Prove a HARDCODED Replicad shape renders (Phase B) BEFORE wiring the LLM.
  - Move the kernel into a Web Worker only as the FINAL step (Phase H), never earlier.
- Where the brief says "verify against the docs," **fetch live docs** (Replicad, opencascade.js,
  Google Gen AI) and confirm exact package paths, WASM filenames, export method names, and the
  Gemini 2.5 Flash-Lite model id before relying on them. Do not trust remembered API names.
- **Gemini API key stays server-side** in the Express proxy. All CAD compute runs client-side.
  Never expose the key to the browser.
- **Commit after each completed task/phase** with a clear message.
- **At each phase boundary: STOP**, tell the user the exact command to verify that phase's
  acceptance check, and wait for their OK before starting the next phase. Work autonomously
  *within* a phase.
- Don't re-litigate decisions the brief already locks; only ask about genuine gaps/blockers.

---

## Phase tracker (acceptance checks from prototype.md §8)

- [x] **A — Scaffold.** npm workspaces; frontend (Next+TS+Tailwind+shadcn) + backend (Express+TS)
      boot from one root `dev`. Backend `/health`, frontend placeholder.
      ✅ Verify: `npm run dev` → :3000 shows "Text-to-CAD"; `curl :4000/health` → `{"status":"ok"}`.
- [x] **B — Prove Replicad renders (NO LLM).** Client-only `ssr:false` component: init opencascade.js,
      `setOC`, build a HARDCODED box-with-hole, mesh faces+edges, render in R3F w/ OrbitControls,
      grid, light. ⚠️ HIGHEST RISK (WASM-in-Next) — SOLVED, see gotchas.
      ✅ Verify: `npm run dev` → :3000 shows a blue 40×20×10mm plate w/ centered hole, orbits.
- [ ] **C — Backend ↔ Gemini (NO frontend wiring).** `POST /api/generate` → Gemini 2.5 Flash-Lite via
      `@google/genai`, §5.1 system prompt w/ verified Replicad cheatsheet + examples, JSON output
      mode, temp ≈0.1. Needs real GEMINI_API_KEY.
      ✅ `curl` w/ a prompt returns well-formed `{code,params,notes}` containing a `buildModel` fn.
- [ ] **D — End-to-end loop.** prompt → /api/generate → `new Function` eval buildModel → mesh → render.
      ✅ "40×20×10 plate with centered 5mm hole" renders correct solid.
- [ ] **E — Export.** "Download STEP" + "Download STL" from current BREP solid (`blobSTEP`/`blobSTL`).
      ✅ Both files download and open correctly.
- [ ] **F — Self-correction.** On kernel throw, auto-retry /api/generate with `previousError` 1–2×.
      ✅ A prompt that first produces broken code recovers automatically.
- [ ] **G — Parametric sliders.** Slider per `params`; dragging re-runs buildModel LOCALLY, no backend.
      ✅ Dragging "Width" resizes instantly, no network request (verify in devtools).
- [ ] **H — Stretch: Web Worker.** Move kernel init + compute into a Web Worker (comlink). LAST.
      ✅ Generation/param changes no longer block the main thread.

---

## Current state (what exists in the repo now)

**Monorepo layout**
```
/ (npm workspaces: ["frontend","backend"])
├── package.json        root: `dev` = concurrently runs both; `build`
├── prototype.md        LOCKED spec (source of truth)
├── SESSION.md          this file
├── frontend/           Next 16 (App Router) + TS + Tailwind v4 + shadcn/ui
│   ├── app/{layout,page}.tsx   page renders <CadApp/> (header + 3D viewport)
│   ├── app/globals.css         imports tailwindcss, tw-animate-css, shadcn/tailwind.css
│   ├── components/ui/button.tsx, lib/utils.ts   (shadcn)
│   ├── components/cad/         Phase B: CadApp (dynamic ssr:false) → CadStage (kernel init/build/mesh) → Viewport (R3F)
│   ├── lib/replicad/kernel.ts  initKernel (load OCCT wasm + setOC), buildBoxWithHole, meshShapeToGeometries
│   ├── lib/empty-module.js     stub aliased for browser fs/path (see gotchas)
│   ├── next.config.ts          turbopack.resolveAlias browser-scoped fs/path → empty stub
│   ├── public/replicad_single.wasm   OCCT wasm (committed; served at /replicad_single.wasm)
│   └── .env.local      NEXT_PUBLIC_BACKEND_URL=http://localhost:4000 (gitignored)
└── backend/            Express + TS proxy
    ├── src/index.ts    /health route; /api/generate added in Phase C
    └── .env            GEMINI_API_KEY/PORT/CORS_ORIGIN (gitignored; see .env.example)
```

**Ports:** frontend :3000, backend :4000. CORS allows :3000.

**Toolchain (verified on the original dev machine):** Node v22.19, npm 10.9, Next **16.2.7**
(Turbopack — see gotchas), React **19.2.4**, Tailwind **v4**, shadcn (base-ui based).

**Verified package versions (installed):** replicad **0.23.1**, replicad-opencascadejs **0.23.0**
(ships `src/replicad_single.{js,wasm}` — confirmed), replicad-threejs-helper **0.23.0**,
three **0.184.0**, @react-three/fiber **9.6.1** (peer wants react >=19 <19.3 → our 19.2.4 OK),
@react-three/drei **10.7.7**.

**Commits so far:**
- `597d28e` Phase A: monorepo scaffold
- `8ff98af` Phase A fix: restore shadcn dependency
- `63869bf` docs: add SESSION.md
- (this commit) Phase B: Replicad/OCCT renders in R3F

---

## Gotchas / decisions discovered (don't relearn the hard way)

- **Next 16 forces Turbopack in `dev`** regardless of `--no-turbopack`. → For Phase B, serve the
  Replicad `.wasm` from **`frontend/public/`** and point `locateFile` at `/replicad_single.wasm`.
  That's bundler-agnostic and the brief's preferred route — avoids Turbopack WASM-import friction.
- **shadcn v4 needs the `shadcn` npm package as a runtime dep** — `globals.css` does
  `@import "shadcn/tailwind.css"` (resolves via the package's `exports` `style` condition). Do NOT
  remove it (that caused a `CssSyntaxError`, fixed in `8ff98af`).
- **npm workspaces:** install from repo ROOT so deps hoist to one lockfile. If a tool (create-next-app,
  shadcn) drops a `frontend/package-lock.json`, delete it and re-run root `npm install`.
- **Windows file locks:** if `npm install` hits `ENOTEMPTY`/`EBUSY`, a node process is holding files.
  Kill the specific dev PIDs by **port** (`netstat -ano | grep :3000`/`:4000` → `taskkill /PID <pid> /F`),
  NOT `taskkill /IM node.exe` (that nukes unrelated node processes).
- **Replicad packages to verify in Phase B** (confirm exact filenames/paths against installed pkg + docs):
  `replicad`, `replicad-opencascadejs` (ships `replicad_single.js` + `replicad_single.wasm` — CONFIRM),
  `replicad-threejs-helper` (`syncGeometries`/`syncFaces`). Init: `setOC(await opencascade({locateFile}))`.
- **R3F stack:** `@react-three/fiber` + `@react-three/drei` (OrbitControls, Grid) over three.js.
  Component must be `"use client"` and dynamically imported with `{ ssr:false }`.

### Phase B gotchas (the WASM-in-Next risk — SOLVED)
- **Turbopack `Can't resolve 'fs'/'path'` (THE blocker).** Both `replicad-opencascadejs/src/replicad_single.js`
  AND `replicad/dist/replicad.js` (bundled opentype font parser) contain dead, browser-unreachable
  `require("fs")/require("path")` branches that Turbopack still STATICALLY resolves → build 500s.
  Fix in `next.config.ts`: `turbopack.resolveAlias` mapping `fs`/`path`/`node:fs`/`node:path` to an
  empty stub — but **two non-obvious rules**:
    1. **Must scope to the `browser` condition** — `{ fs: { browser: "./lib/empty-module.js" }, ... }`.
       A global alias breaks Next's own SSR code (it legitimately needs real `path`/`fs`).
    2. **Alias target must be a PROJECT-RELATIVE path** (`"./lib/empty-module.js"`), NOT an absolute
       FS path — Turbopack mangles absolute paths (prepends `.` → `./home/...` → not found).
- **`next.config.ts` change auto-restarts the dev server** (don't manually `pkill`/restart — it races).
- **`ssr:false` dynamic import must live in a client component** (Next 15+). Hence the thin
  `CadApp.tsx ("use client")` → `dynamic(() => import("./CadStage"), { ssr:false })` boundary;
  `app/page.tsx` (server) just renders `<CadApp/>`.
- **`shape.meshEdges({ keepMesh: true })` is STALE** — in 0.23 the typed signature is
  `meshEdges({ tolerance, angularTolerance })`. The threejs-helper README is out of date here.
- **`syncGeometries(meshes, [])`** returns `{ faces: BufferGeometry, lines: BufferGeometry }[]`.
  Render faces as `<mesh>` + `meshStandardMaterial` (needs light), lines as `<lineSegments>` +
  `lineBasicMaterial`. Add `polygonOffset` to the face material so edges don't z-fight.
- **OCCT loader `.d.ts` types the factory as `init()` (no args)** but the real emscripten module
  takes `{ locateFile }` — cast it: `(opencascade as unknown as OCFactory)({ locateFile })`.
- **Full-height viewport:** R3F `<Canvas>` sizes to its parent. The flex chain must resolve height —
  `body h-full` (NOT `min-h-full`) + `min-h-0` on the flex-1 ancestors, else the canvas collapses
  to ~150px.
- **The `.wasm` (~10.8MB) is committed to `frontend/public/`** so the build resumes on any device.

## Open dependency
- **GEMINI_API_KEY** required for Phase C acceptance (server-side only). Not needed for A/B.
