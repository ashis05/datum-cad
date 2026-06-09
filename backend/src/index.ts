import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { generateCad, MODEL } from "./gemini.js";

// Load .env.local first (your real key lives here, gitignored), then .env.
// With dotenv's array form, the first file to set a variable wins.
dotenv.config({ path: [".env.local", ".env"] });

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "cad-designer-backend",
    model: MODEL,
    hasKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// LLM proxy: prompt -> Gemini -> { code, params, notes }. The browser runs the
// returned code; this backend stays thin and never exposes the API key.
app.post("/api/generate", async (req, res) => {
  const { prompt, currentCode, previousError } = req.body ?? {};

  if (typeof prompt !== "string" || prompt.trim() === "") {
    return res.status(400).json({ error: "Body must include a non-empty `prompt` string." });
  }

  try {
    const result = await generateCad({ prompt, currentCode, previousError });
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[backend] /api/generate failed:", message);
    return res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT} (CORS: ${CORS_ORIGIN})`);
  console.log(`[backend] model: ${MODEL} · key loaded: ${Boolean(process.env.GEMINI_API_KEY)}`);
});
