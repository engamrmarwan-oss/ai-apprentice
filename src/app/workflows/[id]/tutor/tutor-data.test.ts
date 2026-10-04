import { describe, expect, it } from "vitest";
import { parseTutorRouteError, parseTutorSessionStart } from "./tutor-data";

describe("parseTutorSessionStart", () => {
  it("reads the documented tutor-session response", () => {
    expect(
      parseTutorSessionStart({
        ok: true,
        session: { id: "session-id", kind: "tutor", phase: "teach" },
        work_map: { id: "map-id", steps: [], rules: [] },
      }),
    ).toMatchObject({ sessionId: "session-id", workMap: { id: "map-id" } });
  });

  it("rejects a response without a Work Map", () => {
    expect(parseTutorSessionStart({ ok: true, session: { id: "session-id" } })).toBeNull();
  });
});

describe("parseTutorRouteError", () => {
  it("keeps the documented route code and message", () => {
    expect(
      parseTutorRouteError({ error: { code: "no_map", message: "Confirm a Work Map first." } }),
    ).toEqual({ code: "no_map", message: "Confirm a Work Map first." });
  });
});
