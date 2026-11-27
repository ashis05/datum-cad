import {
  badRequest,
  dbFailure,
  deleteConversation,
  getConversation,
  isUuid,
  json,
  notFound,
  parseTitle,
  readJson,
  renameConversation,
  requireUser,
} from "@/lib/server/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  try {
    const conv = await getConversation(gate.userId, id);
    return conv ? json(conv) : notFound();
  } catch (err) {
    return dbFailure("get", err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const body = await readJson(req);
  if (!body.ok) return badRequest(body.error);
  const title = parseTitle(body.value);
  if (!title.ok) return badRequest(title.error);
  try {
    const conv = await renameConversation(gate.userId, id, title.value);
    return conv ? json(conv) : notFound();
  } catch (err) {
    return dbFailure("rename", err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  try {
    const removed = await deleteConversation(gate.userId, id);
    return removed ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }) : notFound();
  } catch (err) {
    return dbFailure("delete", err);
  }
}
