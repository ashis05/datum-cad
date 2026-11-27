import { apiError, badRequest, createConversation, dbFailure, json, listConversations, parseTitle, readJson, requireUser } from "@/lib/server/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  try {
    return json(await listConversations(gate.userId));
  } catch (err) {
    return dbFailure("list", err);
  }
}

export async function POST(req: Request) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const body = await readJson(req);
  if (!body.ok) return badRequest(body.error);
  const title = parseTitle(body.value);
  if (!title.ok) return badRequest(title.error);
  try {
    const created = await createConversation(gate.userId, title.value);
    if (created === "LIMIT") return apiError(400, { error: "You've reached the maximum number of saved chats. Delete some to continue.", code: "BAD_REQUEST" });
    return json(created, 201);
  } catch (err) {
    return dbFailure("create", err);
  }
}
