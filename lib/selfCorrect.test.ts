import { describe, expect, it, vi } from "vitest";
import { generateAndBuildWithRetry } from "./selfCorrect";
import type { CadResponse } from "./api";

const res = (code: string): CadResponse => ({ code, params: [], notes: "" });

describe("generateAndBuildWithRetry", () => {
  it("succeeds on the first try", async () => {
    const generate = vi.fn().mockResolvedValue(res("good"));
    const out = await generateAndBuildWithRetry({ prompt: "p", generate, build: () => "ok" });
    expect(out.attempts).toBe(1);
    expect(out.built).toBe("ok");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries once with the decoded error and broken code", async () => {
    const generate = vi.fn().mockResolvedValueOnce(res("broken")).mockResolvedValueOnce(res("fixed"));
    const build = vi.fn((r: CadResponse) => {
      if (r.code === "broken") throw new Error("boom");
      return 42;
    });
    const onRetry = vi.fn();
    const out = await generateAndBuildWithRetry({ prompt: "p", generate, build, onRetry });
    expect(out.attempts).toBe(2);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toMatchObject({ previousError: "boom", currentCode: "broken" });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith({ attempt: 1, error: "boom" });
  });

  it("propagates generate errors immediately", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("quota"));
    const build = vi.fn();
    await expect(generateAndBuildWithRetry({ prompt: "p", generate, build })).rejects.toThrow("quota");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(build).not.toHaveBeenCalled();
  });

  it("throws the last build error when all attempts fail", async () => {
    let n = 0;
    const generate = vi.fn().mockResolvedValue(res("x"));
    const build = () => {
      throw new Error(`fail ${++n}`);
    };
    await expect(generateAndBuildWithRetry({ prompt: "p", generate, build })).rejects.toThrow("fail 3");
    expect(generate).toHaveBeenCalledTimes(3);
  });
});
