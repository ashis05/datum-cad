# Text-to-CAD (prototype)

Type a natural-language prompt ("a 40×20×10 mm plate with a centered 5 mm hole"),
an LLM writes parametric CAD code, and that code runs **entirely in your browser**
to produce an exact solid — displayed live in 3D and exportable as STEP/STL.

This is a **local single-user prototype**, not a product. No auth, accounts,
databases, or deployment config.

## Pipeline

```
prompt → Express proxy (holds Gemini key) → Gemini 2.5 Flash-Lite → { code, params, notes }
      → browser Web Worker: Replicad + opencascade.js (OCCT/WASM) → BREP solid (source of truth)
      → mesh → React Three Fiber (display)   and   → STEP/STL Blob (download)
```

- The **BREP solid is the source of truth.** Display = tessellated mesh; STL is only an export format.
- The Gemini API key stays **server-side**; the browser never sees it.
- All CAD computation runs **client-side**, inside a **Web Worker** (so the UI never freezes).

## Stack

- **frontend/** — Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, React Three Fiber,
  Replicad + `replicad-opencascadejs` (OCCT as WASM) in a Web Worker via comlink. Runs on **:3000**.
- **backend/** — Express + TypeScript LLM proxy using `@google/genai`. Runs on **:4000**.
- npm workspaces monorepo; one root `dev` script runs both.

## Setup

```bash
# 1. Install (from the repo root — workspaces hoist to one lockfile)
npm install

# 2. Add your Gemini API key (server-side only; .env.local is gitignored)
cp backend/.env.example backend/.env.local
#   then edit backend/.env.local and set GEMINI_API_KEY=...

# 3. Run both apps
npm run dev
```

Then open http://localhost:3000.

### Environment variables

`backend/.env.local`:
- `GEMINI_API_KEY` — your Google Gemini API key (**required**, server-side only).
- `PORT` — backend port (default `4000`).
- `CORS_ORIGIN` — allowed origin (default `http://localhost:3000`).
- `GEMINI_MODEL` — optional model override (default `gemini-2.5-flash-lite`).

`frontend/.env.local`:
- `NEXT_PUBLIC_BACKEND_URL` — backend URL (default `http://localhost:4000`).

> **Gemini free tier:** ~20 generation requests/day. Exhausting it returns HTTP 429
> ("generation failed" on screen) until it resets. Dragging parameter sliders does **not**
> call the LLM (it re-runs the model locally), so dimensional tweaks are free.

## Using it

1. Describe a part in the left pane and press **Send** (Enter; Shift+Enter for a newline).
2. The model generates code, builds the solid in the worker, and renders it. Orbit/zoom with the mouse.
3. Drag sliders in the **Parameters** pane to resize instantly (no AI call).
4. Click **Download STEP** (exact, opens in CAD) or **Download STL** (mesh, opens in slicers).
5. Structural edits ("add a hole") re-prompt the LLM, passing the current code so it edits in place.
6. If generated code fails in the kernel, the app auto-retries with the error (self-correction) up
   to twice before surfacing it.

## ⚠️ Security caveat (prototype only)

Generated model code is executed with `new Function(...)` — i.e. **the browser runs LLM-authored
JavaScript**. This runs inside the Web Worker, which has no DOM access, but a worker is **not** a
security sandbox: it can still make network requests and consume CPU/memory. There are **no time or
resource limits**.

This is acceptable for a **local, single-user prototype**. Do **not** ship this as-is. Before any
multi-user/production use, execute generated code in a hardened sandbox with strict CSP and
time/memory limits (and treat all generated code as untrusted).

## Out of scope

Auth, accounts, databases, payments, deployment/hosting, multi-user, image input, assemblies/
multi-part models, mobile polish.
