import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "cad-designer-backend" });
});

// POST /api/generate is added in Phase C (Gemini proxy).

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT} (CORS: ${CORS_ORIGIN})`);
});
