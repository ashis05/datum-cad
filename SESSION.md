# SESSION — Text-to-CAD prototype (handoff / resume state)

> **Purpose:** portable, in-repo memory so this build can be resumed from any device.
> A fresh Claude/agent session should **read this file first**, then `prototype.md`.
> Keep this file updated at every phase boundary (it's committed to git).

**Last updated:** 2026-06-09 (after Phase E — STEP/STL export)
**Branch:** `master` · **Status:** Phase E complete, awaiting user verification → then Phase F

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
- [x] **C — Backend ↔ Gemini (NO frontend wiring).** `POST /api/generate` → Gemini 2.5 Flash-Lite via
      `@google/genai`, §5.1 system prompt w/ verified Replicad cheatsheet + examples, JSON output
      mode, temp ≈0.1. LIVE-VERIFIED 2026-06-09: plate prompt + novel hexagon prompt both returned
      well-formed {code,params,notes} with a valid buildModel. Model id gemini-2.5-flash-lite works.
      ✅ curl :4000/api/generate -d '{"prompt":"..."}' → {code,params,notes}.
- [x] **D — End-to-end loop.** prompt → /api/generate → `new Function` eval buildModel → mesh → render.
      Two-pane UI: left prompt+history(notes/errors), main viewport. Values init from param defaults.
      LIVE-VERIFIED 2026-06-09 (headless browser): plate prompt → /api/generate 200 → solid renders,
      notes shown, 0 console/page errors.
      ✅ Type "a 40×20×10mm plate with a centered 5mm hole" → correct solid renders.
- [x] **E — Export.** "Download STEP" + "Download STL" buttons (viewport top-right) from the current
      BREP solid. `shape.blobSTEP():Blob` / `shape.blobSTL({binary:true}):Blob`; shape kept in a ref.
      LIVE-VERIFIED 2026-06-09 (headless, real downloads): STEP = valid ISO-10303-21 w/
      MANIFOLD_SOLID_BREP/CLOSED_SHELL + END-ISO-10303-21 terminator (19.8KB); STL = valid binary,
      648 triangles, byte count == 84 + tris*50 (32.5KB). 0 errors.
      ✅ Both buttons download files that open correctly.
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
│   ├── components/cad/         CadApp (dynamic ssr:false) → CadStage (orchestrator: prompt/history + viewport) → Viewport (R3F)
│   ├── lib/api.ts              generateCad() → POST backend /api/generate (NEXT_PUBLIC_BACKEND_URL)
│   ├── lib/download.ts         downloadBlob() — object-URL download trigger
│   ├── lib/replicad/kernel.ts  initKernel, runGeneratedModel, decodeKernelError, exportShape (STEP/STL), meshShapeToGeometries
│   ├── lib/empty-module.js     stub aliased for browser fs/path (see gotchas)
│   ├── next.config.ts          turbopack.resolveAlias browser-scoped fs/path → empty stub
│   ├── public/replicad_single.wasm   OCCT wasm (committed; served at /replicad_single.wasm)
│   └── .env.local      NEXT_PUBLIC_BACKEND_URL=http://localhost:4000 (gitignored)
└── backend/            Express + TS proxy
    ├── src/index.ts        /health (now reports model+hasKey) + POST /api/generate
    ├── src/gemini.ts       @google/genai client, RESPONSE_SCHEMA, generateCad()
    ├── src/systemPrompt.ts SYSTEM_PROMPT — verified replicad 0.23 cheatsheet + 4 examples
    ├── .env.local      GEMINI_API_KEY/PORT/CORS_ORIGIN (gitignored; loaded first by dotenv) ← PUT KEY HERE
    └── .env.example    template (copy to .env.local)
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

### Phase C gotchas / decisions
- **@google/genai is 2.8.0.** Correct config API = `responseMimeType: "application/json"` +
  `responseSchema` (a `Schema` built with the `Type` enum: `Type.OBJECT/STRING/ARRAY/NUMBER`).
  `systemInstruction` + `temperature` go in `config`. `new GoogleGenAI({ apiKey })`,
  `ai.models.generateContent({ model, contents, config })`, read `response.text`. (Online docs
  now show Gemini 3.x + a `responseFormat` shape — that's a NEWER SDK; do NOT use it for 2.8.0.)
- **Model id** defaults to `gemini-2.5-flash-lite` (brief-locked), overridable via `GEMINI_MODEL`
  env. If the live curl 404s on the model, the id was retired — set GEMINI_MODEL to a current one.
- **Key file is `backend/.env.local`** (user's choice) — dotenv loads `[".env.local", ".env"]`,
  first-wins. Added `.env.local`/`.env*.local` to backend/.gitignore (verified ignored).
- **`.env*` files are permission-protected** in this environment: can WRITE (created .env.local)
  but cannot READ them, and cannot overwrite `.env.example` (Write needs a prior Read). Don't fight it.
- **tsx watch does NOT reload on .env.local changes** (only imported source). After pasting the key,
  RESTART the backend (`npm run dev`) for it to load.
- System prompt cheatsheet/examples were verified against replicad 0.23 `.d.ts` signatures; the
  plate-with-hole example is the exact shape proven in Phase B. `meshEdges keepMesh` note carried
  from Phase B still applies on the frontend side.

### Phase D bug fixes (post-acceptance)
- **Opaque "Error: 9105936" = a native OpenCascade exception.** OCCT (via emscripten) throws raw
  NUMBERS (a WASM memory pointer), not Error objects; `String(e)` shows the number. The slim
  `replicad_single` build has NO message decoder. → `kernel.decodeKernelError()` maps a numeric throw
  to actionable text; applied in `runGeneratedModel` (syntax + run) and `meshShapeToGeometries`.
  This decoded message is also what Phase F will feed back as `previousError`.
- **Root cause of that error:** model emitted `plate.fillet(r)` with NO edge finder → fillets EVERY
  edge incl. the hole rims (r=3) with r=4 → geometrically impossible → OCCT aborts. Fix = generate
  `.fillet(r, e => e.inDirection("Z"))` (vertical edges only). Verified the corrected code builds +
  renders in the live app.
- **System-prompt hardening:** added EdgeFinder cheatsheet (`inDirection`/`inPlane`/`atDistance`/
  `inBox`/`not`/`and`/`either`), a RULE that fillet/chamfer of specific edges MUST pass a finder
  (bare `.fillet(r)` rounds all edges and usually fails), "apply fillets LAST", and a worked
  corner-holes+filleted-vertical-edges example. `fillet(radius, filter?: (e:EdgeFinder)=>EdgeFinder)`;
  `Direction = "X"|"Y"|"Z"|Point`.
- **tsx watch restart race (EADDRINUSE):** editing an imported backend src file makes `tsx watch`
  respawn before the old process frees :4000 → new process crashes, OLD (stale) one keeps serving.
  Symptom: code/prompt changes don't take effect. Fix: fully kill the :4000 listener (it can orphan
  from its tsx parent — kill the PID from `ss -ltnp | grep :4000`) and start one fresh backend.

### Replicad API gaps the model keeps hitting (fixed via system-prompt rules)
Each was a real, generalizable replicad-API misuse surfaced by complex prompts; all now documented
in `backend/src/systemPrompt.ts`. (These are exactly the class of errors Phase F auto-corrects.)
1. **`.fillet(r)` with no finder** rounds EVERY edge → fails around holes/thin walls. Use a finder:
   `.fillet(r, e => e.inDirection("Z"))`. `fillet(radius, filter?: (e:EdgeFinder)=>EdgeFinder)`.
2. **Transforms consume the shape** — `Shape.translate/rotate/mirror` call `this.delete()` and return
   a NEW shape. Reusing the original → "object has been deleted". Fix: `shape.clone().translate(...)`
   before each reuse, or rebuild the tool. (`.cut/.fuse/.intersect` do NOT consume args.)
3. **Finder combinators take FUNCTIONS**: `not(fn)`, `and([fn,...])`, `either([fn,...])` (each `fn`
   is `f => f.xxx()`); chaining finder methods ANDs them. Passing a finder object →
   "finderFun is not a function".
4. **Pipeline stages**: 2D Drawing → `.sketchOnPlane()` → Sketch → `.extrude()` → 3D Shape. A Sketch
   has ONLY `.extrude` (no `.translate`). Move the Drawing (2D) or the Shape (3D), never the Sketch.
   Symptom: "...sketchOnPlane(...).translate is not a function".
- **Frontier note:** Flash-Lite handles 1–3 feature parts reliably. Very dense / physically
  over-constrained prompts (e.g. 80×50×30 enclosure: 6 features, 10mm fillet on 2mm walls, circular
  lip on a rect opening) are nondeterministic — each generation may slip on a different API. After the
  4 rules above the enclosure prompt BUILDS, but exhaustively patching the prompt has diminishing
  returns. The systematic fix is **Phase F (self-correction)**: feed `decodeKernelError()` output back
  to Gemini as `previousError` and auto-retry. Prioritize Phase F over more prompt whack-a-mole.

### Phase D gotchas / decisions
- **Code eval:** `new Function("replicad","params", code + "\\nreturn buildModel(replicad, params);")`,
  called with the full `import * as replicad from "replicad"` namespace (generated code destructures
  from it) + values map. Lives in `kernel.runGeneratedModel`. Prototype-only; sandbox in Phase H.
- **Param values** init from each param's `default` (Object.fromEntries). `params`/`values` are held
  in CadStage state (getters unused until Phase E/G — wrote `const [, setX]` to avoid lint).
- **Edits chain:** CadStage passes `currentCode` to the backend on every prompt after the first.
- **State carried for later phases:** `code` (export/retry), `params`+`values` (sliders).
- **Dev port conflict:** a `next dev` already on :3000 makes a 2nd `npm run dev` exit ("Another next
  dev server is already running") — it falls back to :3001 then aborts. Just use the running :3000.

### Phase E gotchas / decisions
- **Export from the BREP, not the mesh** (brief §2). `exportShape(shape, "step"|"stl")` in kernel.ts;
  STEP exact, STL binary. Meshing does NOT consume the shape, so the same shape renders AND exports.
- **Shape kept in `shapeRef` (useRef)** in CadStage — export needs it but shouldn't trigger re-render.
  Buttons live in the viewport top-right, shown only when `geometries.length > 0`.

## ⚠️ Gemini free-tier quota (hit during Phase E testing)
- **Free tier = 20 generate requests/day** for gemini-2.5-flash-lite → 429 RESOURCE_EXHAUSTED once
  exhausted (resets daily). The backend surfaces the 429 message as the on-screen error. This is NOT
  a bug. Mitigations: (a) Phase G makes slider tweaks LOCAL (no LLM call) — big quota saver;
  (b) enable billing / raise quota; (c) test sparingly. If "generation fails" with a 429, it's quota.

## Open dependency
- **GEMINI_API_KEY** — in `backend/.env.local` (loaded, working). Server-side only. Free-tier 20/day.
