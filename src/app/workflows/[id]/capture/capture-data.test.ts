import { describe, expect, it } from "vitest";
import { parseRouteError, parseSessionId, startProblem } from "./capture-data";

describe("capture route data", () => {
  it("reads a created session id", () => {
    expect(parseSessionId({ ok: true, session: { id: "session-1" } })).toBe("session-1");
    expect(parseSessionId({ ok: true, session: {} })).toBeNull();
  });

  it("reads the shared route error envelope", () => {
    expect(
      parseRouteError({
        ok: false,
        error: { code: "not_expert", message: "Only the expert can do that." },
      }),
    ).toEqual({ code: "not_expert", message: "Only the expert can do that." });
    expect(parseRouteError(null)).toBeNull();
  });
});

describe("startProblem", () => {
  it("shows the daily limit message as a limit", () => {
    expect(
      startProblem(429, { code: "daily_limit", message: "You have started 20 sessions today." }, "Generic."),
    ).toEqual({ limit: true, message: "You have started 20 sessions today." });
  });

  it("falls back to the route message for other errors", () => {
    expect(startProblem(503, { code: "unavailable", message: "Try again." }, "Generic.")).toEqual({
      limit: false,
      message: "Try again.",
    });
    expect(startProblem(500, null, "Generic.")).toEqual({ limit: false, message: "Generic." });
  });
});
