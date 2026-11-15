// Browser client for the generate route (app/api/generate). The Gemini key never
// leaves the server; the browser only ever talks to our own /api route.

export interface CadParam {
  name: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface CadResponse {
  code: string;
  params: CadParam[];
  notes: string;
}

export interface GenerateRequest {
  prompt: string;
  currentCode?: string;
  previousError?: string;
}

/** Machine-readable reason a request failed. Shared with the server route. */
export type ApiErrorCode =
  | "BAD_REQUEST" // 400: missing/oversized prompt or fields
  | "RATE_LIMITED" // 429: this client hit our per-IP limit (see retryAfter)
  | "QUOTA" // 429: the Gemini key itself is out of quota
  | "NO_KEY" // 503: server has no GEMINI_API_KEY configured
  | "UPSTREAM" // 502: Gemini failed or returned unusable output
  | "NETWORK"; // fetch itself failed (offline, server down)

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  retryAfter?: number; // seconds, for RATE_LIMITED / QUOTA when known
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode,
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function generateCad(body: GenerateRequest): Promise<CadResponse> {
  let res: Response;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", "NETWORK", 0);
  }

  if (!res.ok) {
    let data: Partial<ApiErrorBody> = {};
    try {
      data = await res.json();
    } catch {
      /* non-JSON error page */
    }
    throw new ApiError(
      data.error || `Request failed (${res.status}).`,
      data.code ?? (res.status === 429 ? "RATE_LIMITED" : res.status >= 500 ? "UPSTREAM" : "BAD_REQUEST"),
      res.status,
      data.retryAfter,
    );
  }

  return (await res.json()) as CadResponse;
}
