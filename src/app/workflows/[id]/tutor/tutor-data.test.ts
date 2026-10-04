import { describe, expect, it } from "vitest";
import { parseLanguages, parseTutorRouteError, parseTutorSessionStart } from "./tutor-data";

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
    ).toEqual({ code: "no_map", languageField: null, message: "Confirm a Work Map first." });
  });

  it("keeps the language field message", () => {
    expect(
      parseTutorRouteError({
        error: {
          code: "invalid_input",
          message: "Check the form.",
          fields: { language: "That language is not on offer." },
        },
      }),
    ).toMatchObject({ code: "invalid_input", languageField: "That language is not on offer." });
  });
});

describe("parseLanguages", () => {
  it("puts English first and sorts the rest by their own name", () => {
    expect(
      parseLanguages({
        ok: true,
        languages: [
          { code: "fr", name: "French", own_name: "Français" },
          { code: "de", name: "German", own_name: "Deutsch" },
          { code: "en", name: "English", own_name: "English" },
        ],
      })?.map((language) => language.code),
    ).toEqual(["en", "de", "fr"]);
  });

  it("rejects a language without its own name", () => {
    expect(parseLanguages({ ok: true, languages: [{ code: "de", name: "German" }] })).toBeNull();
  });
});
