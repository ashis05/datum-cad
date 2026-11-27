// Chat-history data access + request validation. Every query is scoped by
// userId; a conversation that is missing or owned by someone else is
// indistinguishable (callers get null -> 404). neon-http has no interactive
// transactions, so multi-step writes use single statements or db.batch().

import { and, asc, count, desc, eq } from "drizzle-orm";
import type {
  ApiErrorBody,
  CadParam,
  ConversationDetail,
  ConversationSummary,
  NewMessage,
  Snapshot,
  StoredMessage,
} from "@/lib/api";
import { currentUserId } from "@/auth";
import { getDb, hasDb, schema } from "./db";

const { conversations, messages } = schema;

export const MAX_TITLE = 120;
export const MAX_PROMPT = 2000;
export const MAX_TEXT = 4000;
export const MAX_CODE = 30_000;
export const MAX_PARAMS = 50;
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_LIST = 50;
export const MAX_MESSAGES_PER_CONVERSATION = 200;
export const MAX_CONVERSATIONS_PER_USER = 500;

// ── Validation (pure) ──────────────────────────────────────────────────────

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function parseTitle(body: unknown): Parsed<string> {
  if (!isObj(body)) return fail("Request body must be a JSON object.");
  const t = body.title;
  if (typeof t !== "string" || !t.trim()) return fail("`title` must be a non-empty string.");
  return { ok: true, value: t.trim().slice(0, MAX_TITLE).trim() };
}

function parseParam(p: unknown): CadParam | null {
  if (!isObj(p)) return null;
  const { name, label, default: d, min, max, step } = p;
  if (typeof name !== "string" || typeof label !== "string") return null;
  if (!isNum(d) || !isNum(min) || !isNum(max) || !isNum(step)) return null;
  return { name, label, default: d, min, max, step };
}

export function parseSnapshot(raw: unknown): Parsed<Snapshot> {
  if (!isObj(raw)) return fail("`snapshot` must be an object.");
  const { code, params, values, designPrompt } = raw;
  if (typeof code !== "string" || code.length > MAX_CODE) {
    return fail(`\`snapshot.code\` must be a string of at most ${MAX_CODE} characters.`);
  }
  if (!Array.isArray(params) || params.length > MAX_PARAMS) {
    return fail(`\`snapshot.params\` must be an array of at most ${MAX_PARAMS} items.`);
  }
  const outParams: CadParam[] = [];
  for (const p of params) {
    const cp = parseParam(p);
    if (!cp) return fail("`snapshot.params` items need string name/label and finite default/min/max/step.");
    outParams.push(cp);
  }
  if (!isObj(values)) return fail("`snapshot.values` must be an object of numbers.");
  const outValues: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!isNum(v)) return fail("`snapshot.values` must contain only finite numbers.");
    outValues[k] = v;
  }
  if (typeof designPrompt !== "string" || designPrompt.length > MAX_PROMPT) {
    return fail(`\`snapshot.designPrompt\` must be a string of at most ${MAX_PROMPT} characters.`);
  }
  return { ok: true, value: { code, params: outParams, values: outValues, designPrompt } };
}

export function parseNewMessage(body: unknown): Parsed<NewMessage> {
  if (!isObj(body)) return fail("Request body must be a JSON object.");
  const { prompt, notes, error, corrected, snapshot } = body;
  if (typeof prompt !== "string" || !prompt.trim()) return fail("`prompt` is required.");
  if (prompt.length > MAX_PROMPT) return fail(`\`prompt\` must be at most ${MAX_PROMPT} characters.`);
  const out: NewMessage = { prompt };
  if (notes !== undefined) {
    if (typeof notes !== "string" || notes.length > MAX_TEXT) return fail(`\`notes\` must be a string of at most ${MAX_TEXT} characters.`);
    out.notes = notes;
  }
  if (error !== undefined) {
    if (typeof error !== "string" || error.length > MAX_TEXT) return fail(`\`error\` must be a string of at most ${MAX_TEXT} characters.`);
    out.error = error;
  }
  if (corrected !== undefined) {
    if (typeof corrected !== "boolean") return fail("`corrected` must be a boolean.");
    out.corrected = corrected;
  }
  if (snapshot !== undefined) {
    const s = parseSnapshot(snapshot);
    if (!s.ok) return s;
    out.snapshot = s.value;
  }
  return { ok: true, value: out };
}

/** Read and JSON-parse a request body, rejecting anything over ~64KB. */
export async function readJson(req: Request): Promise<Parsed<unknown>> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail("Request body is too large.");
  let text: string;
  try {
    text = await req.text();
  } catch {
    return fail("Request body must be valid JSON.");
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return fail("Request body is too large.");
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return fail("Request body must be valid JSON.");
  }
}

// ── HTTP helpers shared by the routes ──────────────────────────────────────

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function apiError(status: number, body: ApiErrorBody): Response {
  return json(body, status);
}

export const badRequest = (error: string) => apiError(400, { error, code: "BAD_REQUEST" });
export const notFound = () => apiError(404, { error: "Conversation not found.", code: "NOT_FOUND" });
export const dbFailure = (where: string, err: unknown) => {
  console.error(`[history] ${where} failed:`, err instanceof Error ? err.message : err);
  return apiError(502, { error: "Chat history is temporarily unavailable.", code: "UPSTREAM" });
};

/** Auth + DB availability gate. Returns the userId, or an error Response. */
export async function requireUser(): Promise<{ userId: string } | { response: Response }> {
  const userId = await currentUserId();
  if (!userId) return { response: apiError(401, { error: "Sign in to use chat history.", code: "UNAUTHORIZED" }) };
  if (!hasDb()) {
    return { response: apiError(503, { error: "Chat history isn't configured on this server.", code: "UPSTREAM" }) };
  }
  return { userId };
}

// ── Row mapping ────────────────────────────────────────────────────────────

type ConvRow = typeof conversations.$inferSelect;
type MsgRow = typeof messages.$inferSelect;

const toSummary = (r: ConvRow): ConversationSummary => ({
  id: r.id,
  title: r.title,
  updatedAt: r.updatedAt.toISOString(),
});

const toMessage = (r: MsgRow): StoredMessage => ({
  id: r.id,
  prompt: r.prompt,
  notes: r.notes,
  error: r.error,
  corrected: r.corrected,
  snapshot: r.snapshot ?? null,
  createdAt: r.createdAt.toISOString(),
});

// ── Data access (all scoped by userId; throw on DB errors) ─────────────────

const owned = (userId: string, id: string) => and(eq(conversations.id, id), eq(conversations.userId, userId));

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const rows = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(MAX_LIST);
  return rows.map(toSummary);
}

/** Returns "LIMIT" when the user already has the maximum number of conversations. */
export async function createConversation(userId: string, title: string): Promise<ConversationSummary | "LIMIT"> {
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(conversations).where(eq(conversations.userId, userId));
  if (n >= MAX_CONVERSATIONS_PER_USER) return "LIMIT";
  const [row] = await db.insert(conversations).values({ userId, title }).returning();
  return toSummary(row);
}

export async function getConversation(userId: string, id: string): Promise<ConversationDetail | null> {
  const db = getDb();
  const [conv] = await db.select().from(conversations).where(owned(userId, id)).limit(1);
  if (!conv) return null;
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt))
    .limit(MAX_MESSAGES_PER_CONVERSATION);
  return { ...toSummary(conv), messages: rows.map(toMessage) };
}

export async function renameConversation(userId: string, id: string, title: string): Promise<ConversationSummary | null> {
  const [row] = await getDb().update(conversations).set({ title }).where(owned(userId, id)).returning();
  return row ? toSummary(row) : null;
}

export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  const rows = await getDb().delete(conversations).where(owned(userId, id)).returning({ id: conversations.id });
  return rows.length > 0;
}

/** null = not found / not yours; "FULL" = message cap reached. */
export async function appendMessage(userId: string, id: string, msg: NewMessage): Promise<StoredMessage | null | "FULL"> {
  const db = getDb();
  const [conv] = await db.select({ id: conversations.id }).from(conversations).where(owned(userId, id)).limit(1);
  if (!conv) return null;
  const [{ n }] = await db.select({ n: count() }).from(messages).where(eq(messages.conversationId, conv.id));
  if (n >= MAX_MESSAGES_PER_CONVERSATION) return "FULL";
  const [inserted] = await db.batch([
    db
      .insert(messages)
      .values({
        conversationId: conv.id,
        prompt: msg.prompt,
        notes: msg.notes ?? null,
        error: msg.error ?? null,
        corrected: msg.corrected ?? false,
        snapshot: msg.snapshot ?? null,
      })
      .returning(),
    db.update(conversations).set({ updatedAt: new Date() }).where(owned(userId, id)),
  ]);
  return toMessage(inserted[0]);
}
