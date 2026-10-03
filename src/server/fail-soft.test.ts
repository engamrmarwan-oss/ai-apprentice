import { describe, expect, it } from "vitest";
import { failSoft } from "./fail-soft";

describe("failSoft", () => {
  it("returns the value when the call succeeds", async () => {
    const result = await failSoft("svc", async () => 42, { timeoutMs: 1000 });
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("turns a thrown error into a value", async () => {
    const result = await failSoft(
      "svc",
      async () => {
        throw new Error("boom");
      },
      { timeoutMs: 1000 },
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "error", service: "svc", message: "boom" },
    });
  });

  it("returns a timeout and aborts the signal when the call hangs", async () => {
    let seen: AbortSignal | undefined;
    const result = await failSoft(
      "svc",
      (signal) => {
        seen = signal;
        return new Promise<never>(() => {});
      },
      { timeoutMs: 20 },
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "timeout",
        service: "svc",
        message: "svc did not answer within 20 ms",
      },
    });
    expect(seen?.aborted).toBe(true);
  });

  it("does not leak a rejection that arrives after the timeout", async () => {
    const result = await failSoft(
      "svc",
      (signal) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      { timeoutMs: 20 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("timeout");
  });
});
