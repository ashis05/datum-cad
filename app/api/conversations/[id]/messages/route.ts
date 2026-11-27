import {
  apiError,
  appendMessage,
  badRequest,
  dbFailure,
  isUuid,
  json,
  notFound,
  parseNewMessage,
  readJson,
  requireUser,
} from "@/lib/server/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const body = await readJson(req);
  if (!body.ok) return badRequest(body.error);
  const msg = parseNewMessage(body.value);
  if (!msg.ok) return badRequest(msg.error);
  try {
    const saved = await appendMessage(gate.userId, id, msg.value);
    if (saved === null) return notFound();
    if (saved === "FULL") {
      return apiError(400, { error: "This chat is full. Start a new chat to continue.", code: "BAD_REQUEST" });
    }
    return json(saved, 201);
  } catch (err) {
    return dbFailure("append", err);
  }
}
