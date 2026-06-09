// Thin client for the backend LLM proxy. The browser never sees the Gemini key;
// it only talks to our Express proxy.

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

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

export async function generateCad(body: GenerateRequest): Promise<CadResponse> {
  const res = await fetch(`${BACKEND_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Backend error (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* keep the status-based message */
    }
    throw new Error(message);
  }

  return (await res.json()) as CadResponse;
}
