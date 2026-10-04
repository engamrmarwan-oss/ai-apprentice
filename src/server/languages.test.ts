import { describe, expect, it } from "vitest";
import { isLanguage, languageName, languageSchema, LANGUAGE_CODES, listLanguages } from "./languages";

describe("languages", () => {
  it("offers each language once, English among them, as two-letter codes", () => {
    expect(new Set(LANGUAGE_CODES).size).toBe(LANGUAGE_CODES.length);
    expect(LANGUAGE_CODES).toContain("en");
    for (const code of LANGUAGE_CODES) expect(code).toMatch(/^[a-z]{2}$/);
  });

  it("names a language in English and in itself", () => {
    expect(languageName("de")).toBe("German");
    expect(listLanguages().find((language) => language.code === "de")).toEqual({ code: "de", name: "German", own_name: "Deutsch" });
    expect(listLanguages().find((language) => language.code === "en")?.own_name).toBe("English");
  });

  it("gives every language a name", () => {
    for (const language of listLanguages()) {
      expect(language.name).not.toBe(language.code);
      expect(language.own_name.length).toBeGreaterThan(1);
    }
  });

  it("takes a code on offer, in any case, and refuses anything else", () => {
    expect(languageSchema.parse(" DE ")).toBe("de");
    expect(languageSchema.safeParse("xx").success).toBe(false);
    expect(languageSchema.safeParse("german").success).toBe(false);
    expect(isLanguage("de")).toBe(true);
    expect(isLanguage("tlh")).toBe(false);
  });
});
