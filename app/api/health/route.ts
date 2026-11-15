import { getModel } from "@/lib/server/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", model: getModel(), hasKey: Boolean(process.env.GEMINI_API_KEY) });
}
