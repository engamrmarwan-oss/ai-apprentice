import { describe, expect, it } from "vitest";
import { parseRouteError, parseSessionId } from "./capture-data";

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
