// Browser client + shared contracts for our API routes (generate, usage,
// conversations). The Gemini key never
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

/** A built model state that can be restored. Persisted as JSON in message.snapshot. */
export interface Snapshot {
  code: string;
  params: CadParam[];
  values: Record<string, number>;
  designPrompt: string; // first prompt of this design — names the export files
}

export interface GenerateRequest {
  prompt: string;
  currentCode?: string;
  previousError?: string;
}

/** Machine-readable reason a request failed. Shared with the server route. */
export type ApiErrorCode =
  | "BAD_REQUEST" // 400: missing/oversized prompt or fields
  | "RATE_LIMITED" // 429: this client hit its per-user / per-IP limit (see retryAfter)
  | "AUTH_REQUIRED" // 429: anonymous daily limit reached — sign in for a higher limit
  | "UNAUTHORIZED" // 401: endpoint needs a signed-in user (history)
  | "FORBIDDEN" // 403: account disabled
  | "NOT_FOUND" // 404: conversation doesn't exist or isn't yours
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

// ── Usage / rate limits ────────────────────────────────────────────────────

export type UsageTier = "anonymous" | "free" | "pro";

export interface UsageWindow {
  limit: number;
  remaining: number;
  resetAt: number; // ms epoch when this window resets
}

/** GET /api/usage. Reading it does NOT consume quota. */
export interface Usage {
  tier: UsageTier;
  signedIn: boolean;
  minute: UsageWindow;
  day: UsageWindow;
}

/**
 * Every /api/generate response (success or 429) carries the DAY window as
 * X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset (reset = unix
 * seconds). Returns null if the headers are missing.
 */
export function usageFromHeaders(headers: Headers): UsageWindow | null {
  const limit = Number(headers.get("X-RateLimit-Limit"));
  const remaining = Number(headers.get("X-RateLimit-Remaining"));
  const reset = Number(headers.get("X-RateLimit-Reset"));
  if (!headers.has("X-RateLimit-Limit") || ![limit, remaining, reset].every(Number.isFinite)) return null;
  return { limit, remaining, resetAt: reset * 1000 };
}

export async function getUsage(): Promise<Usage> {
  return request<Usage>("/api/usage");
}

// ── Chat history (signed-in users only) ────────────────────────────────────

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string; // ISO
}

export interface StoredMessage {
  id: string;
  prompt: string;
  notes: string | null;
  error: string | null;
  corrected: boolean;
  snapshot: Snapshot | null;
  createdAt: string; // ISO
}

export interface ConversationDetail extends ConversationSummary {
  messages: StoredMessage[]; // oldest first
}

export interface NewMessage {
  prompt: string;
  notes?: string;
  error?: string;
  corrected?: boolean;
  snapshot?: Snapshot;
}

/** GET /api/conversations — newest first, at most 50. */
export const listConversations = () => request<ConversationSummary[]>("/api/conversations");

/** POST /api/conversations — title is trimmed and cut to 120 chars server-side. */
export const createConversation = (title: string) =>
  request<ConversationSummary>("/api/conversations", { method: "POST", body: { title } });

/** GET /api/conversations/:id */
export const getConversation = (id: string) =>
  request<ConversationDetail>(`/api/conversations/${encodeURIComponent(id)}`);

/** PATCH /api/conversations/:id — rename. */
export const renameConversation = (id: string, title: string) =>
  request<ConversationSummary>(`/api/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: { title } });

/** DELETE /api/conversations/:id — 204. */
export const deleteConversation = (id: string) =>
  request<void>(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });

/** POST /api/conversations/:id/messages — appends and bumps conversation.updatedAt. */
export const appendMessage = (conversationId: string, msg: NewMessage) =>
  request<StoredMessage>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: msg,
  });

// ── Generate ───────────────────────────────────────────────────────────────

/** Called after every /api/generate response that carried rate-limit headers. */
let usageListener: ((w: UsageWindow) => void) | null = null;
export function onGenerateUsage(fn: ((w: UsageWindow) => void) | null) {
  usageListener = fn;
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

  const w = usageFromHeaders(res.headers);
  if (w) usageListener?.(w);

  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as CadResponse;
}

// ── Shared fetch helper ────────────────────────────────────────────────────

async function request<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", "NETWORK", 0);
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function toApiError(res: Response): Promise<ApiError> {
  let data: Partial<ApiErrorBody> = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  return new ApiError(
    data.error || `Request failed (${res.status}).`,
    data.code ??
      (res.status === 429
        ? "RATE_LIMITED"
        : res.status === 401
          ? "UNAUTHORIZED"
          : res.status === 403
            ? "FORBIDDEN"
            : res.status === 404
              ? "NOT_FOUND"
              : res.status >= 500
                ? "UPSTREAM"
                : "BAD_REQUEST"),
    res.status,
    data.retryAfter,
  );
}
