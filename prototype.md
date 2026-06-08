# Project Brief — Text-to-CAD Prototype

> **How to use this:** paste this whole document into Claude Code as the input to GSD's `/gsd:new-project` (or your discuss/plan entry point). It is the spec. Let GSD run its discuss → plan → execute phases on top of it. The phases in §8 are a suggested decomposition GSD can refine — but **keep the de-risking order**, it matters. Where this brief says "verify against the docs," do it before relying on an API.

---

## 1. Goal & scope

Build a **working prototype** of a text-to-CAD web app: the user types a natural-language prompt ("a 40×20×10mm plate with a 5mm hole in the center"), an LLM writes parametric CAD code, that code runs **entirely in the user's browser** to produce an exact solid, which is displayed live in 3D and can be exported as STEP/STL.

This is a **prototype**, not a product. Optimize for getting the full pipeline working end-to-end and easy to extend. Do not add auth, accounts, databases, payments, multi-user, or deployment config. Single local user is fine.

---

## 2. The pipeline (build to exactly this flow)

```
User prompt
   │
   ▼
Express backend  (LLM PROXY — holds the Gemini API key; browser never sees it)
   │  builds messages: system rules + few-shot + user prompt (+ current code on edits)
   ▼
Gemini 2.5 Flash-Lite  →  returns JSON: { code, params, notes }   (code = Replicad JS)
   │
   ▼ (JSON returns to the browser)
BROWSER runs the returned code:
   Replicad  ──calls──▶  opencascade.js (OCCT, as WebAssembly)
                              │
                              ▼
                         BREP solid   ← the single source of truth (exact geometry)
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
     tessellate → mesh                export → STEP / STL Blob
     → Three.js / R3F (DISPLAY)       → download button (FILES)
```

**Two non-negotiable facts about this flow (do not "simplify" them):**

1. **The BREP solid is the source of truth.** To *display* it, tessellate it into a mesh and feed Three.js. To *download* it, export STEP or STL. **Do NOT route "OCCT → STL → Three.js" for display** — that throws away the exact geometry. Display path = mesh; STL is only an export format.
2. **Replicad does not emit a separate file.** Replicad is a JS library that calls into opencascade.js at runtime. There is no intermediate "OpenCascade code" artifact.

---

## 3. Tech stack & repo structure

**Monorepo, npm workspaces, single root folder:**

```
/                      ← root (npm workspaces)
├── package.json       ← workspaces ["frontend","backend"] + a single "dev" script
├── frontend/          ← Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Three.js (React Three Fiber)
└── backend/           ← Express + TypeScript (LLM proxy)
```

- **Frontend:** Next.js (App Router), TypeScript, Tailwind, shadcn/ui, **React Three Fiber** (`@react-three/fiber`) + `@react-three/drei` (for `OrbitControls`, grid, etc.) over Three.js. Runs on **:3000**.
- **Backend:** Express + TypeScript, runs on **:4000**, `cors` enabled for `http://localhost:3000`, `dotenv` for the key. Use the official **Google Gen AI SDK (`@google/genai`)** — verify the current package + the exact model id for "Gemini 2.5 Flash-Lite" before coding.
- **Root scripts:** `dev` runs both apps together (e.g. `concurrently`). Frontend uses `next dev`; backend uses `tsx`/`nodemon` watch.
- Keep TypeScript throughout.

---

## 4. CRITICAL technical constraints — read before writing any frontend code

The hardest part of this whole project is running Replicad (which depends on the opencascade.js **WebAssembly** module) inside Next.js. Most of the risk lives here. Handle it as follows:

**4.1 Replicad packages (verify exact versions/paths from the installed packages):**
- `replicad` — core API.
- `replicad-opencascadejs` — the slim OCCT WASM build (only what replicad needs). It ships a JS loader + a `.wasm` file (commonly `replicad_single.js` / `replicad_single.wasm` — **confirm the actual filenames in the installed package**).
- `replicad-threejs-helper` — `syncGeometries` / `syncFaces` to turn replicad's meshed shapes into Three.js `BufferGeometry` (faces + edges).

**4.2 Initialization (the must-do step):** you must load opencascade.js and **inject it into replicad** before any modeling call:
```ts
import opencascade from "replicad-opencascadejs/src/replicad_single.js"; // confirm path
import wasmUrl from "replicad-opencascadejs/src/replicad_single.wasm?url"; // confirm how to get the URL in Next
import { setOC } from "replicad";

const OC = await opencascade({ locateFile: () => wasmUrl });
setOC(OC); // replicad is now ready
```
The `.wasm` must be served as a static asset. For a Next.js prototype the most reliable route is to **copy the `.wasm` into `/public`** and point `locateFile` at `/replicad_single.wasm`. (A bundler `?url` import may also work — pick whichever the bundler cooperates with; prefer `/public` if there's any friction.)

**4.3 Client-only:** Replicad/opencascade.js cannot run on the server. The viewport + kernel logic must live in a **client component** (`"use client"`), and the component that loads the kernel should be **dynamically imported with `{ ssr: false }`** (`next/dynamic`) so Next never tries to SSR it.

**4.4 Web Worker — last, not first.** Replicad docs recommend running the kernel in a Web Worker so heavy compute doesn't freeze the UI. **For this prototype, get the pipeline working on the main thread first** (see phases), then move compute into a worker (e.g. via `comlink`) as the final step. Do not start with the worker — the worker + Next bundler interaction is the single most likely thing to stall the build before anything renders.

**4.5 Display vs export (from §2):** use `shape.mesh({ tolerance: 0.05, angularTolerance: 30 })` + `shape.meshEdges()` → `replicad-threejs-helper` → BufferGeometry for display. Use replicad's STL/STEP export (e.g. `shape.blobSTL()` / `shape.blobSTEP()` — **confirm method names**) to produce downloadable Blobs.

---

## 5. Backend spec (Express LLM proxy)

**Single endpoint:** `POST /api/generate`

Request body:
```json
{
  "prompt": "make the legs 20% thicker",
  "currentCode": "function buildModel(replicad, params){ ... }",  // optional, present on edits
  "previousError": "BRep_API: command not done"                  // optional, present on retry
}
```

Response body (must be valid JSON — use Gemini's JSON/structured-output mode):
```json
{
  "code": "function buildModel(replicad, params) { /* ... */ return shape; }",
  "params": [
    { "name": "width", "label": "Width (mm)", "default": 40, "min": 5, "max": 200, "step": 1 }
  ],
  "notes": "Increased leg thickness from 4mm to 4.8mm."
}
```

Behavior:
- Hold `GEMINI_API_KEY` server-side (`.env`). The browser must never receive it.
- Build the Gemini call as: **system instruction** (the rulebook in §5.1) + the user `prompt`. On edits, include `currentCode` and instruct "modify only what's requested." On retries, include `previousError` and instruct "fix the error, return corrected JSON."
- Use **`temperature` ≈ 0.1** and Gemini's **JSON output mode** (response schema matching the response body above) so parsing is reliable.
- Return the parsed JSON straight to the client. Keep the backend thin — the browser runs the code and decides when to retry.

### 5.1 Gemini system prompt (starter — improve it during the build)

> **Build task:** before finalizing this, **fetch the current Replicad API docs (replicad.xyz) and embed a concise Replicad API cheatsheet here**, then **verify the example code below actually compiles in the kernel and fix any API calls that are wrong.** Flash-Lite has a large context window — spend it on a tight API reference + 3–6 correct examples; that is the #1 driver of output reliability.

```
You generate CAD code using the Replicad JavaScript library. You output ONE function that builds ONE solid.

OUTPUT FORMAT
- Respond with ONLY a JSON object (no markdown, no prose) of shape:
  { "code": "<a complete JS function 'function buildModel(replicad, params){...}'>",
    "params": [ { "name", "label", "default", "min", "max", "step" } ],
    "notes": "<one short sentence describing what you built or changed>" }
- "code" MUST define exactly: function buildModel(replicad, params) { ... return shape; }
  - It receives the replicad module as `replicad` and the current parameter values as `params`.
  - It MUST return a single replicad shape (the finished solid).
  - Read every editable dimension from `params` (e.g. params.width), and declare each one in the "params" array.

RULES
- Units are millimeters. Center the part sensibly near the origin.
- Use ONLY documented Replicad functions (see the API reference below). Never invent methods.
- Every dimension a user might reasonably want to change MUST be a parameter in `params` and read from `params` in the code.
- When given existing code plus an edit request, change ONLY what is asked. Preserve all other code and parameter values verbatim.
- If a previous error is provided, fix that error and return corrected JSON.

REPLICAD API REFERENCE
<<< paste a concise, verified cheatsheet here during the build >>>

EXAMPLES  (verify these compile; fix API calls to match the real Replicad API)
User: "a 40x20x10mm plate with a 5mm hole in the center"
Assistant:
{ "code": "function buildModel(replicad, params){ const { drawRectangle, drawCircle } = replicad; const plate = drawRectangle(params.length, params.width).sketchOnPlane().extrude(params.thickness); const hole = drawCircle(params.holeRadius).sketchOnPlane().extrude(params.thickness); return plate.cut(hole); }",
  "params": [
    { "name": "length", "label": "Length (mm)", "default": 40, "min": 10, "max": 200, "step": 1 },
    { "name": "width", "label": "Width (mm)", "default": 20, "min": 10, "max": 200, "step": 1 },
    { "name": "thickness", "label": "Thickness (mm)", "default": 10, "min": 1, "max": 50, "step": 1 },
    { "name": "holeRadius", "label": "Hole radius (mm)", "default": 2.5, "min": 0.5, "max": 20, "step": 0.5 }
  ],
  "notes": "A rectangular plate with a centered through-hole." }

(Add 2–5 more verified examples: an L-bracket with mounting holes; a walled rectangular enclosure (box with a shelled-out inside / wall thickness); a cylindrical standoff with a bore. Keep them mechanical/engineering-flavored.)
```

---

## 6. Frontend spec (UI)

A two-pane layout (use shadcn/ui components + Tailwind):

- **Left pane — Prompt & history:** a text input + Send button; a running list of prompts with each response's `notes`. While a request is in flight, show a loading state. Show kernel/compile errors here in a readable way.
- **Main pane — 3D viewport:** React Three Fiber canvas showing the model. Render **faces and edges** (use the two BufferGeometries from `replicad-threejs-helper`; faces with a `MeshStandardMaterial`, edges as lines so the part reads as engineering geometry). Include `OrbitControls`, a ground grid + axes (drei), and at least one light (a bare standard material is black without light). Auto-frame the model after each build.
- **Right pane (or a panel) — Parameters:** render a labeled slider for each entry in `params`. **Dragging a slider re-runs `buildModel(replicad, params)` locally with the new values and re-renders — with NO call to the backend.** This is the key UX/cost feature: dimensional tweaks are instant and free; only structural changes ("add a hole") call the LLM.
- **Export:** two buttons — "Download STEP" and "Download STL" — that export the current solid and trigger a file download.

---

## 7. LLM output contract (how the browser runs the code)

- The backend returns `{ code, params, notes }` where `code` is the text of `function buildModel(replicad, params){...}`.
- The frontend keeps in state: the current `code` string, the current `params` array, and the current parameter **values** (initialized from each param's `default`).
- To produce a solid: evaluate `code` into a callable (e.g. `new Function("replicad","params", code + "; return buildModel(replicad, params);")`) and call it with the replicad module + current values. Mesh the result → render. Export from the same result.
- On a slider change: only the values change → re-run the same `buildModel` → re-render. No backend call.
- On a new structural prompt: call `/api/generate` with `currentCode` → replace `code`+`params` → reset values to defaults → run.
- **Security note (prototype only):** evaluating model code with `new Function` is acceptable for this *local single-user prototype*. It must NOT ship to production without sandboxing the execution in the Web Worker and adding time/resource limits. Note this clearly in the README.

---

## 8. Suggested build phases (keep this de-risking order)

Each phase ends with a concrete, demoable acceptance check. GSD can split these further, but do not reorder — later phases depend on earlier integrations being proven.

- **Phase A — Scaffold.** Monorepo with npm workspaces; `frontend` (Next.js+TS+Tailwind+shadcn) and `backend` (Express+TS) both boot from one root `dev` script. ✅ *Both apps run; frontend shows a placeholder, backend has a `/health` route.*
- **Phase B — Prove Replicad renders (NO LLM yet).** In a client-only, `ssr:false` component: init opencascade.js, `setOC`, build a **hardcoded** shape (e.g. a box with a hole), mesh it, render faces+edges in R3F with OrbitControls, grid, light. ✅ *A hardcoded 3D solid appears on screen and orbits.* (This is the riskiest integration — get it working in isolation.)
- **Phase C — Backend talks to Gemini (NO frontend wiring).** `/api/generate` calls Gemini 2.5 Flash-Lite with the §5.1 system prompt and returns valid `{code,params,notes}` JSON. ✅ *A `curl` with a prompt returns well-formed JSON containing a `buildModel` function.*
- **Phase D — End-to-end loop.** Wire prompt → `/api/generate` → evaluate `buildModel` → mesh → render. ✅ *Typing "a 40×20×10 plate with a centered 5mm hole" renders the correct solid.*
- **Phase E — Export.** "Download STEP" and "Download STL" buttons export the current solid. ✅ *Both files download and open correctly (STEP in a CAD viewer, STL in a slicer/mesh viewer).*
- **Phase F — Self-correction.** If the kernel throws while running generated code, re-call `/api/generate` with `previousError` (auto-retry once or twice) before surfacing the error. ✅ *A prompt that first produces broken code recovers automatically on retry.*
- **Phase G — Parametric sliders.** Render sliders from `params`; dragging re-runs `buildModel` locally with new values, no backend call. ✅ *Dragging "Width" resizes the model instantly with no network request (verify in devtools).*
- **Phase H — Stretch: Web Worker.** Move kernel init + compute into a Web Worker (e.g. comlink) so the UI stays responsive on heavy models. ✅ *Generation/param changes no longer block the main thread.*

---

## 9. Environment & running

- `backend/.env`: `GEMINI_API_KEY=...`, `PORT=4000`, `CORS_ORIGIN=http://localhost:3000`.
- `frontend/.env.local`: `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000`.
- Root: `npm install` (workspaces), then `npm run dev` starts both. Provide a README documenting setup, the env vars, and the prototype security caveat from §7.

---

## 10. Explicitly out of scope (do not build)

Auth/login, user accounts, databases, payments, deployment/hosting config, multi-user collaboration, image-reference input, assemblies/multi-part models, mobile layout polish. Keep dependencies minimal. If a choice is ambiguous, prefer the simplest thing that satisfies the phase's acceptance check.

---

## 11. Definition of done (prototype)

From a single `npm run dev`: a user can type a prompt and see an exact 3D solid render in the browser; adjust its dimensions live with sliders (no network call); recover automatically from an occasional bad generation; and download a valid STEP and STL of the result — with the Gemini API key never exposed to the browser, and all CAD computation running client-side.