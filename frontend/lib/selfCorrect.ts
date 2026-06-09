// Phase F — self-correction loop.
//
// When generated code throws in the kernel (build or mesh), re-call the LLM with
// the decoded error as `previousError` (and the broken code as `currentCode`) so
// it can fix its own output, retrying a couple of times before giving up.
//
// Pure orchestration with injected `generate`/`build` so it is unit-testable in
// isolation (the kernel rarely fails on demand). Keep it free of React/DOM.

import type { CadResponse, GenerateRequest } from "./api";

export interface RetryInfo {
  attempt: number; // the attempt that just failed (1-based)
  error: string; // decoded kernel error fed back to the model
}

export interface GenerateAndBuildResult<R> {
  result: CadResponse;
  built: R;
  attempts: number; // total attempts used (1 = succeeded first try)
}

/**
 * Generate code and build it, auto-correcting kernel failures.
 *
 * - `generate` errors (network / backend / quota) propagate IMMEDIATELY — a
 *   retry can't fix a 429 or a dead server, and shouldn't burn the budget.
 * - `build` errors (the generated code throws when run/meshed) trigger a retry:
 *   the decoded message becomes `previousError` and the failing code becomes
 *   `currentCode` for the next generation.
 */
export async function generateAndBuildWithRetry<R>(opts: {
  prompt: string;
  currentCode?: string;
  maxAttempts?: number;
  generate: (req: GenerateRequest) => Promise<CadResponse>;
  build: (result: CadResponse) => R; // throws on kernel/build failure
  onRetry?: (info: RetryInfo) => void;
}): Promise<GenerateAndBuildResult<R>> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let currentCode = opts.currentCode;
  let previousError: string | undefined;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await opts.generate({
      prompt: opts.prompt,
      currentCode,
      previousError,
    });

    try {
      const built = opts.build(result);
      return { result, built, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      previousError = lastError;
      currentCode = result.code; // send the broken code back to be fixed
      if (attempt < maxAttempts) opts.onRetry?.({ attempt, error: lastError });
    }
  }

  throw new Error(lastError || "Failed to build a valid model after retries.");
}
