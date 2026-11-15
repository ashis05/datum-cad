import { ApiError } from "@/lib/api";

/** Turn anything thrown by generate/build into a short, friendly sentence. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "RATE_LIMITED":
        return err.retryAfter
          ? `You're sending prompts quickly — try again in ${Math.ceil(err.retryAfter)}s.`
          : "You're sending prompts quickly — try again in a moment.";
      case "QUOTA":
        return "The AI quota is used up for now. Please try again later.";
      case "NO_KEY":
        return "The server isn't configured with an AI key yet, so it can't generate parts.";
      case "NETWORK":
        return "Couldn't reach the server. Check your connection and try again.";
      case "UPSTREAM":
        return "The model had a hiccup. Try again.";
      default:
        return err.message;
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return `The generated code didn't build: ${message}`;
}
