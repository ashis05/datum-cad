// Gemini client wrapper for the text-to-CAD proxy.
//
// API verified against @google/genai@2.8.0 (installed): new GoogleGenAI({ apiKey }),
// ai.models.generateContent({ model, contents, config }), config supports
// systemInstruction / temperature / responseMimeType / responseSchema, Type enum.

import { GoogleGenAI, Type } from "@google/genai";
import type { Schema } from "@google/genai";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

// Brief locks "Gemini 2.5 Flash-Lite". Overridable via env in case the id changes.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

// Response contract from prototype.md §5 — enforced via structured output so
// parsing on the server is reliable.
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    code: {
      type: Type.STRING,
      description: "A complete JS function: function buildModel(replicad, params){ ... return shape; }",
    },
    params: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          label: { type: Type.STRING },
          default: { type: Type.NUMBER },
          min: { type: Type.NUMBER },
          max: { type: Type.NUMBER },
          step: { type: Type.NUMBER },
        },
        required: ["name", "label", "default", "min", "max", "step"],
        propertyOrdering: ["name", "label", "default", "min", "max", "step"],
      },
    },
    notes: { type: Type.STRING },
  },
  required: ["code", "params", "notes"],
  propertyOrdering: ["code", "params", "notes"],
};

export interface GenerateInput {
  prompt: string;
  currentCode?: string;
  previousError?: string;
}

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

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to backend/.env.local (see backend/.env.example).",
    );
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

/** Build the user-turn content: prompt, plus current code on edits and the prior error on retries. */
function buildContents({ prompt, currentCode, previousError }: GenerateInput): string {
  const parts: string[] = [`User request: ${prompt}`];
  if (currentCode) {
    parts.push(
      `\nHere is the CURRENT code. Modify ONLY what the request asks; preserve everything else verbatim:\n${currentCode}`,
    );
  }
  if (previousError) {
    parts.push(
      `\nThe previous code threw this error when run in the kernel. Fix it and return corrected JSON:\n${previousError}`,
    );
  }
  return parts.join("\n");
}

export async function generateCad(input: GenerateInput): Promise<CadResponse> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildContents(input),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  let parsed: CadResponse;
  try {
    parsed = JSON.parse(text) as CadResponse;
  } catch {
    throw new Error(`Gemini returned non-JSON output: ${text.slice(0, 500)}`);
  }

  // Minimal contract validation — the browser runs this code, so fail loudly here.
  if (typeof parsed.code !== "string" || !parsed.code.includes("buildModel")) {
    throw new Error("Gemini response is missing a valid buildModel function in `code`.");
  }
  if (!Array.isArray(parsed.params)) {
    throw new Error("Gemini response is missing a `params` array.");
  }

  return parsed;
}

export { MODEL };
